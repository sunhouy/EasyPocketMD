const DiffMatchPatch = require('diff-match-patch');
const diff = new DiffMatchPatch();

// Undo changed spans only when their post-edit text is still intact. Never use
// fuzzy patching: overlapping edits must be reviewed instead of deleting a peer's work.
function undoTextChange(before, after, current) {
    if (after === current) return before;
    if (before === after) return current;
    const alignment = diff.diff_main(after, current);
    let source = 0, target = 0;
    const equal = [];
    for (const [op, text] of alignment) {
        if (op === 0) equal.push({ start: source, end: source + text.length, target });
        if (op !== 1) source += text.length;
        if (op !== -1) target += text.length;
    }
    const changes = diff.diff_main(before, after);
    const edits = [];
    let pos = 0, start = null, oldText = '', newText = '';
    const flush = () => {
        if (start === null) return;
        const end = start + newText.length;
        const span = equal.find(part => part.start <= start && part.end >= end);
        let mapped;
        if (span) mapped = span.target + start - span.start;
        else if (!after && start === 0) mapped = 0;
        else throw Object.assign(new Error('该段内容已被其他编辑改写，请手动处理差异'), { code: 409 });
        if (current.slice(mapped, mapped + newText.length) !== newText) {
            throw Object.assign(new Error('该段内容已被其他编辑改写，请手动处理差异'), { code: 409 });
        }
        edits.push({ start: mapped, length: newText.length, text: oldText });
        start = null; oldText = ''; newText = '';
    };
    for (const [op, text] of changes) {
        if (op === 0) { flush(); pos += text.length; }
        else {
            if (start === null) start = pos;
            if (op === -1) oldText += text;
            else { newText += text; pos += text.length; }
        }
    }
    flush();
    let result = current;
    for (const edit of edits.reverse()) {
        result = result.slice(0, edit.start) + edit.text + result.slice(edit.start + edit.length);
    }
    return result;
}
module.exports = { undoTextChange };
