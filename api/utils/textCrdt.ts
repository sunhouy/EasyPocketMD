const Y = require('yjs');
const DiffMatchPatch = require('diff-match-patch');

const dmp = new DiffMatchPatch();

function normalizeText(text) {
    return String(text || '');
}

function applyDiff(yText, diffs) {
    let pos = 0;
    for (const [op, text] of diffs) {
        if (op === 0) {
            pos += text.length;
        } else if (op === -1) {
            yText.delete(pos, text.length);
        } else if (op === 1) {
            yText.insert(pos, text);
            pos += text.length;
        }
    }
}

function mergeTextWithCrdt(baseText, localText, remoteText) {
    const base = normalizeText(baseText);
    const local = normalizeText(localText);
    const remote = normalizeText(remoteText);

    if (remote === base) {
        return { content: local, merged: false };
    }
    if (local === base) {
        return { content: remote, merged: false };
    }
    if (local === remote) {
        return { content: local, merged: false };
    }

    if (!base) {
        return { content: local, merged: false };
    }

    const baseDoc = new Y.Doc();
    baseDoc.getText('content').insert(0, base);
    const baseUpdate = Y.encodeStateAsUpdate(baseDoc);

    const localDoc = new Y.Doc();
    Y.applyUpdate(localDoc, baseUpdate);
    applyDiff(localDoc.getText('content'), dmp.diff_main(base, local));
    const localUpdate = Y.encodeStateAsUpdate(localDoc, baseUpdate);

    const remoteDoc = new Y.Doc();
    Y.applyUpdate(remoteDoc, baseUpdate);
    applyDiff(remoteDoc.getText('content'), dmp.diff_main(base, remote));
    const remoteUpdate = Y.encodeStateAsUpdate(remoteDoc, baseUpdate);

    const mergedDoc = new Y.Doc();
    Y.applyUpdate(mergedDoc, baseUpdate);
    Y.applyUpdate(mergedDoc, localUpdate);
    Y.applyUpdate(mergedDoc, remoteUpdate);

    const merged = mergedDoc.getText('content').toString();
    return { content: merged, merged: true };
}

module.exports = {
    mergeTextWithCrdt
};