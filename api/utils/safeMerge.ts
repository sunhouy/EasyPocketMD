import DiffMatchPatch from 'diff-match-patch';
export type MergeResult = { clean: true; content: string } | { clean: false };
type Edit = { start: number; end: number; text: string };
function edits(base: string, next: string): Edit[] {
    const dmp = new DiffMatchPatch(); dmp.Diff_Timeout = 0.025;
    const result: Edit[] = []; let offset = 0, pending: Edit | undefined;
    for (const [kind, text] of dmp.diff_main(base, next)) {
        if (kind === 0) { if (pending) result.push(pending); pending = undefined; offset += text.length; }
        else { pending ||= { start: offset, end: offset, text: '' }; if (kind < 0) { offset += text.length; pending.end = offset; } else pending.text += text; }
    }
    if (pending) result.push(pending); return result;
}
/** Only combine independent edits. Ambiguous overlapping replacements require a decision. */
export function safeMerge(base: string | undefined, local: string, remote: string): MergeResult {
    if (local === remote) return { clean: true, content: local };
    if (base === undefined) return { clean: false };
    if (local === base) return { clean: true, content: remote };
    if (remote === base) return { clean: true, content: local };
    const left = edits(base, local), right = edits(base, remote), combined = [...left];
    for (const b of right) {
        let duplicate = false;
        for (const a of left) {
            if (a.start === b.start && a.end === b.end && a.text === b.text) { duplicate = true; break; }
            // Insertions at replacement boundaries are deliberately considered ambiguous.
            if (a.start <= b.end && b.start <= a.end) return { clean: false };
        }
        if (!duplicate) combined.push(b);
    }
    let content = base;
    for (const e of combined.sort((a, b) => b.start - a.start)) content = content.slice(0, e.start) + e.text + content.slice(e.end);
    return { clean: true, content };
}
