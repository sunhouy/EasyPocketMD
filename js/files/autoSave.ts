/** Constant-time input handler. Extract and persist a coalesced draft after typing pauses. */
export class AutoSaveScheduler {
    private draftTimer: ReturnType<typeof setTimeout> | undefined;
    private saveTimer: ReturnType<typeof setTimeout> | undefined;
    private forceTimer: ReturnType<typeof setTimeout> | undefined;
    private fileId: string | null = null;
    private inFlight = false;
    constructor(private options: { current: () => string | null; dirty: (id: string) => boolean; persist: () => Promise<unknown> | void; save: () => Promise<unknown>; debounceMs: number; forceMs: number }) {}
    trigger() {
        const id = this.options.current(); if (!id || !this.options.dirty(id)) return;
        if (id !== this.fileId) { this.clear(); this.fileId = id; }
        clearTimeout(this.draftTimer); clearTimeout(this.saveTimer);
        this.draftTimer = setTimeout(() => { if (id === this.options.current()) Promise.resolve(this.options.persist()).catch(console.warn); }, 250);
        this.saveTimer = setTimeout(() => void this.save(id), this.options.debounceMs);
        // Continuous typing must not postpone the maximum save interval indefinitely.
        this.forceTimer ||= setTimeout(() => { this.forceTimer = undefined; void this.save(id); }, this.options.forceMs);
    }
    private async save(id: string) {
        if (id !== this.options.current() || !this.options.dirty(id) || this.inFlight) return;
        this.inFlight = true;
        try { await this.options.save(); } catch (error) { console.warn(error); }
        finally { this.inFlight = false; if (id === this.options.current() && this.options.dirty(id)) this.trigger(); }
    }
    clear() { clearTimeout(this.draftTimer); clearTimeout(this.saveTimer); clearTimeout(this.forceTimer); this.draftTimer = this.saveTimer = this.forceTimer = undefined; this.fileId = null; }
}
