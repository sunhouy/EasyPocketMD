/** Shared HTML / PDF / Word defaults. H4 is the base heading size, in points. */
export const EXPORT_HEADING_SCALES = [2, 1.5, 1.25, 1, 1, 1];
export function exportHeadingSizes(settings: Record<string, unknown> = {}): Record<number, number> {
    const positive = (value: unknown, fallback: number) => {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 && number <= 200 ? number : fallback;
    };
    const base = positive(settings.titleFontSize, 12);
    return Object.fromEntries(EXPORT_HEADING_SCALES.map((scale, i) => [i + 1,
        settings.useCustomHeadingSizes ? positive(settings['h' + (i + 1) + 'Size'], base * scale) : base * scale]));
}
export function exportFontStack(settings: Record<string, unknown> = {}, heading = false): string {
    const clean = (value: unknown, fallback: string) => typeof value === 'string' && value.trim()
        ? value.replace(/["\\<>;{}\r\n]/g, '').trim() : fallback;
    const english = clean(settings.englishFont, 'Times New Roman');
    const chinese = clean(heading ? settings.titleFont : settings.bodyFont, heading ? 'SimHei' : 'SimSun');
    // Liberation Serif is metric-compatible with Times on Linux. It has no CJK
    // glyphs, allowing the independently selected Chinese font to take over.
    const latinFallback = english === 'Times New Roman' ? '"Liberation Serif", ' : '';
    return `"${english}", ${latinFallback}"${chinese}", "Noto Serif CJK SC", "Microsoft YaHei", serif`;
}
