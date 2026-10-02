import * as Y from 'yjs';
import DiffMatchPatch from 'diff-match-patch';

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

export function mergeTextWithCrdt(baseText, localText, remoteText) {
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

    // An empty snapshot may represent unknown ancestry, not an empty document.
    if (!base) return { content: local, merged: false };

    const baseDoc = new Y.Doc();
    baseDoc.getText('content').insert(0, base);
    const baseUpdate = Y.encodeStateAsUpdate(baseDoc);
    const baseVector = Y.encodeStateVector(baseDoc);

    const localDoc = new Y.Doc();
    Y.applyUpdate(localDoc, baseUpdate);
    applyDiff(localDoc.getText('content'), dmp.diff_main(base, local));
    const localUpdate = Y.encodeStateAsUpdate(localDoc, baseVector);

    const remoteDoc = new Y.Doc();
    Y.applyUpdate(remoteDoc, baseUpdate);
    applyDiff(remoteDoc.getText('content'), dmp.diff_main(base, remote));
    const remoteUpdate = Y.encodeStateAsUpdate(remoteDoc, baseVector);

    const mergedDoc = new Y.Doc();
    Y.applyUpdate(mergedDoc, baseUpdate);
    Y.applyUpdate(mergedDoc, localUpdate);
    Y.applyUpdate(mergedDoc, remoteUpdate);

    const merged = mergedDoc.getText('content').toString();
    for (const doc of [baseDoc, localDoc, remoteDoc, mergedDoc]) doc.destroy();
    return { content: merged, merged: true };
}

