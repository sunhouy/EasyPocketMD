/** Normalize persisted milliseconds and server date strings without inventing a date. */
export function fileTimestamp(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    const numeric = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)) ? Number(value) : NaN;
    const timestamp = Number.isFinite(numeric) ? numeric : new Date(String(value)).getTime();
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}
