export interface AutoSaveSchedulerOptions {
  debounceMs: number;
  forceMs: number;
  clear: () => void;
  onStatusSaving: () => void;
  persistDraft: () => Promise<void> | void;
  isDirty: () => boolean;
  save: () => Promise<void>;
  onError: (error: unknown, mode: 'debounce' | 'force' | 'draft') => void;
}

export class AutoSaveScheduler {
  private inFlight = false;
  private readonly options: AutoSaveSchedulerOptions;

  constructor(options: AutoSaveSchedulerOptions) {
    this.options = options;
  }

  trigger(): void {
    if (!this.options.isDirty()) {
      this.options.clear();
      return;
    }

    this.options.clear();
    this.options.onStatusSaving();

    Promise.resolve(this.options.persistDraft()).catch((error) => {
      this.options.onError(error, 'draft');
    });

    (window as any).autoSaveTimer = window.setTimeout(() => {
      this.saveOnce('debounce');
    }, this.options.debounceMs);

    (window as any).autoSaveForceTimer = window.setTimeout(() => {
      this.saveOnce('force').finally(() => {
        if (this.options.isDirty()) {
          this.trigger();
        }
      });
    }, this.options.forceMs);
  }

  private async saveOnce(mode: 'debounce' | 'force'): Promise<void> {
    if (!this.options.isDirty() || this.inFlight) return;
    this.inFlight = true;
    try {
      await this.options.save();
    } catch (error) {
      this.options.onError(error, mode);
    } finally {
      this.inFlight = false;
    }
  }
  
}
