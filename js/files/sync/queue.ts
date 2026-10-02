type Job = { key: string; priority: number; run: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (reason: unknown) => void };
/** One background operation at a time; a newly selected file jumps ahead of pending work. */
export class SyncQueue {
    private jobs = new Map<string, Job>(); private active = false;
    enqueue(key: string, priority: number, run: () => Promise<unknown>): Promise<unknown> {
        const existing = this.jobs.get(key);
        if (existing) { existing.priority = Math.max(existing.priority, priority); existing.run = run; return Promise.resolve(); }
        return new Promise((resolve, reject) => { this.jobs.set(key, { key, priority, run, resolve, reject }); this.drain(); });
    }
    private async drain() {
        if (this.active) return; this.active = true;
        try {
            while (this.jobs.size) {
                await new Promise(resolve => setTimeout(resolve, 0));
                const job = [...this.jobs.values()].sort((a, b) => b.priority - a.priority)[0];
                this.jobs.delete(job.key);
                try { job.resolve(await job.run()); } catch (error) { job.reject(error); }
            }
        } finally { this.active = false; }
    }
}
