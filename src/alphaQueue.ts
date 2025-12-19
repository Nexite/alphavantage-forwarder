interface QueuedRequest {
    query: any;
    resolve: (value: any) => void;
    reject: (error: any) => void;
    priority: number;
    rawResponse?: boolean;
}

class AlphaVantageQueue {
    private queue: QueuedRequest[] = [];
    private readonly MAX_REQUESTS_PER_MINUTE = 600;
    private readonly MAX_REQUESTS_PER_SECOND = 20;
    private requestTimestamps: number[] = [];
    private isProcessing = false;
    private readonly BATCH_SIZE = 20; // Changed to match per-second limit
    private readonly WINDOW_SIZE = 60000; // 1 minute
    private readonly SECOND_WINDOW_SIZE = 1000; // 1 second
    private readonly DEFAULT_PRIORITY = 10;

    constructor() {
        setInterval(() => {
            const oneMinuteAgo = Date.now() - this.WINDOW_SIZE;
            this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
        }, 50);
    }

    private get availableSlots(): number {
        const oneMinuteAgo = Date.now() - this.WINDOW_SIZE;
        const inMinute = this.requestTimestamps.filter(ts => ts > oneMinuteAgo).length;
        const oneSecondAgo = Date.now() - this.SECOND_WINDOW_SIZE;
        const inSecond = this.requestTimestamps.filter(ts => ts > oneSecondAgo).length;

        const minuteSlots = this.MAX_REQUESTS_PER_MINUTE - inMinute;
        const secondSlots = this.MAX_REQUESTS_PER_SECOND - inSecond;

        return Math.min(minuteSlots, secondSlots);
    }

    private async executeRequest(request: QueuedRequest): Promise<void> {
        const alphaAdvantageUrl = 'https://www.alphavantage.co/query';
        const apiKey = process.env.ALPHA_ADVANTAGE_API_KEY;
        
        try {
            const response = await fetch(
                `${alphaAdvantageUrl}?${new URLSearchParams({ 
                    ...request.query, 
                    apikey: apiKey 
                } as Record<string, string>)}`
            );
            
            if (request.rawResponse) {
                request.resolve(response);
                this.requestTimestamps.push(Date.now());
                return;
            }

            const data = await response.json();

            if (data.Information?.includes('Thank you for using Alpha Vantage')) {
                await new Promise(resolve => setTimeout(resolve, 50));
                this.queue.unshift({ ...request });
                return;
            }

            if (data.Information?.includes('Burst pattern detected')) {
                await new Promise(resolve => setTimeout(resolve, 50));
                this.queue.unshift({ ...request });
                return;
            }

            this.requestTimestamps.push(Date.now());
            request.resolve(data);
        } catch (error) {
            await new Promise(resolve => setTimeout(resolve, 50));
            this.queue.unshift({ ...request });
        }
    }

    private sortQueue(): void {
        this.queue.sort((a, b) => a.priority - b.priority);
    }

    private async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;

        try {
            while (this.queue.length > 0) {
                const available = this.availableSlots;
                
                if (available === 0) {
                const oldestTimestamp = this.requestTimestamps[0];
                const now = Date.now();
                // Calculate wait time based on the oldest request in the last minute window
                const waitTimeMinute = oldestTimestamp + this.WINDOW_SIZE - now;

                // Calculate wait time based on the oldest request in the last second window
                const oneSecondAgo = now - this.SECOND_WINDOW_SIZE;
                const oldestSecondTimestamp = this.requestTimestamps.find(ts => ts > oneSecondAgo) || now;
                const waitTimeSecond = oldestSecondTimestamp + this.SECOND_WINDOW_SIZE - now;

                const waitTime = Math.max(10, waitTimeMinute, waitTimeSecond);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }

                this.sortQueue();

                const batchSize = Math.min(available, this.BATCH_SIZE, this.queue.length);
                const batch = this.queue.splice(0, batchSize);
                
                const now = Date.now();
                const batchPromises = batch.map((request, index) => {
                return new Promise(resolve => setTimeout(resolve, index * (this.SECOND_WINDOW_SIZE / this.MAX_REQUESTS_PER_SECOND)))
                        .then(() => this.executeRequest(request));
                });

                await Promise.all(batchPromises);
            }
        } finally {
            this.isProcessing = false;
            
            if (this.queue.length > 0) {
                setImmediate(() => this.processQueue());
            }
        }
    }

    public async addToQueue(query: any, priority: number = this.DEFAULT_PRIORITY, rawResponse: boolean = false): Promise<any> {
        const clampedPriority = Math.max(0, Math.min(priority, this.DEFAULT_PRIORITY));
        
        return new Promise((resolve, reject) => {
            this.queue.push({ 
                query, 
                resolve, 
                reject, 
                priority: clampedPriority,
                rawResponse 
            });
            
            if (!this.isProcessing) {
                setImmediate(() => this.processQueue());
            }
        });
    }

    public get stats() {
        const now = Date.now();
        const recentRequests = this.requestTimestamps.filter(ts => ts > now - this.WINDOW_SIZE);
        
        const queueByPriority = this.queue.reduce((acc, req) => {
            acc[req.priority] = (acc[req.priority] || 0) + 1;
            return acc;
        }, {} as Record<number, number>);

        return {
            queueSize: this.queue.length,
            currentRate: recentRequests.length,
            availableSlots: this.availableSlots,
            requestsInLastMinute: recentRequests.length,
            requestsInLastSecond: recentRequests.filter(ts => ts > now - this.SECOND_WINDOW_SIZE).length,
            queueByPriority
        };
    }
}
export const alphaVantageQueue = new AlphaVantageQueue();
