export class Queue {
    private queue: (() => Promise<any>)[] = [];
    private processing = false;

    async add(task: () => Promise<any>) {
        this.queue.push(task);
        if (!this.processing) {
            await this.process();
        }
    }

    private async process() {
        if (this.processing) return;
        this.processing = true;

        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) {
                try {
                    await task();
                } catch (error) {
                    console.error('Error processing queue task:', error);
                }
            }
        }

        this.processing = false;
    }
} 