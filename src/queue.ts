type QueuedRequest = {
    promise: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    retryCount: number;
};

type AlphaVantageRateLimitResponse = {
    Information: string;
}

function isRateLimitResponse(response: any): response is AlphaVantageRateLimitResponse {
    return response && typeof response.Information === 'string' && 
           response.Information.includes('Thank you for using Alpha Vantage');
}

export class QueryQueue {
    private queue: QueuedRequest[] = [];
    private processing = false;
    private requestsThisMinute = 0;
    private lastResetTime = Date.now();
    private activeRequests = 0;
    
    private readonly RATE_LIMIT = 600;
    private readonly RESET_INTERVAL = 60000;
    private readonly MAX_CONCURRENT_REQUESTS = 50;
    private readonly MAX_RETRIES = 10;
    private readonly RETRY_DELAYS = [2000, 5000, 10000, 30000, 60000];

    constructor() {
        setInterval(() => {
            this.requestsThisMinute = 0;
            this.lastResetTime = Date.now();
        }, this.RESET_INTERVAL);
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async processRequest(request: QueuedRequest): Promise<void> {
        try {
            // Check rate limit
            if (this.requestsThisMinute >= this.RATE_LIMIT) {
                const timeUntilReset = this.RESET_INTERVAL - (Date.now() - this.lastResetTime);
                await this.delay(timeUntilReset);
                this.requestsThisMinute = 0;
            }

            this.requestsThisMinute++;
            const result = await request.promise();
            
            if (isRateLimitResponse(result)) {
                if (request.retryCount < this.MAX_RETRIES) {
                    const delayTime = this.RETRY_DELAYS[Math.min(request.retryCount, this.RETRY_DELAYS.length - 1)];
                    console.log(`Rate limit hit, retry ${request.retryCount + 1}/${this.MAX_RETRIES} in ${delayTime}ms`);
                    await this.delay(delayTime);
                    
                    // Try again immediately
                    const retryResult = await request.promise();
                    if (!isRateLimitResponse(retryResult)) {
                        request.resolve(retryResult);
                        return;
                    }
                    
                    // If still rate limited, requeue
                    this.queue.push({
                        ...request,
                        retryCount: request.retryCount + 1
                    });
                    return;
                }
                throw new Error(`Rate limit exceeded after ${this.MAX_RETRIES} retries`);
            }
            
            request.resolve(result);
        } catch (error) {
            if (request.retryCount < this.MAX_RETRIES) {
                const delayTime = this.RETRY_DELAYS[Math.min(request.retryCount, this.RETRY_DELAYS.length - 1)];
                console.log(`Request failed, retry ${request.retryCount + 1}/${this.MAX_RETRIES} in ${delayTime}ms`);
                await this.delay(delayTime);
                
                this.queue.push({
                    ...request,
                    retryCount: request.retryCount + 1
                });
            } else {
                request.reject(error);
            }
        } finally {
            this.activeRequests--;
            this.processQueue();
        }
    }

    private async processQueue(): Promise<void> {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        try {
            while (this.queue.length > 0 && this.activeRequests < this.MAX_CONCURRENT_REQUESTS) {
                const request = this.queue.shift()!;
                this.activeRequests++;
                this.processRequest(request);
            }
        } finally {
            this.processing = false;
        }
    }

    async add<T>(requestFn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({
                promise: requestFn,
                resolve,
                reject,
                retryCount: 0
            });
            this.processQueue();
        });
    }
}

export const queryQueue = new QueryQueue();
