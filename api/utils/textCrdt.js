const Y = require('yjs');

const TEXT_NAME = 'content';

function splitChars(text) {
    return Array.from(String(text || ''));
}

function findPatchRange(fromText, toText) {
    const fromChars = splitChars(fromText);
    const toChars = splitChars(toText);
    let prefix = 0;
    while (prefix < fromChars.length && prefix < toChars.length && fromChars[prefix] === toChars[prefix]) {
        prefix++;
    }

    let suffix = 0;
    while (
        suffix < fromChars.length - prefix &&
        suffix < toChars.length - prefix &&
        fromChars[fromChars.length - 1 - suffix] === toChars[toChars.length - 1 - suffix]
    ) {
        suffix++;
    }

    const start = fromChars.slice(0, prefix).join('').length;
    const deleteLength = fromChars.slice(prefix, fromChars.length - suffix).join('').length;
    const insertText = toChars.slice(prefix, toChars.length - suffix).join('');

    return { start, deleteLength, insertText };
}

function replaceTextSnapshot(ytext, targetText) {
    const currentText = ytext.toString();
    const target = String(targetText || '');
    if (currentText === target) return;

    const patch = findPatchRange(currentText, target);
    if (patch.deleteLength > 0) {
        ytext.delete(patch.start, patch.deleteLength);
    }
    if (patch.insertText) {
        ytext.insert(patch.start, patch.insertText);
    }
}

function createBaseDoc(baseText) {
    const doc = new Y.Doc({ gc: false });
    doc.clientID = 1;
    doc.getText(TEXT_NAME).insert(0, String(baseText || ''));
    return doc;
}

function createSnapshotUpdate(baseUpdate, baseStateVector, targetText, clientId) {
    const doc = new Y.Doc({ gc: false });
    Y.applyUpdate(doc, baseUpdate);
    doc.clientID = clientId;
    replaceTextSnapshot(doc.getText(TEXT_NAME), targetText);
    return Y.encodeStateAsUpdate(doc, baseStateVector);
}

function mergeTextWithCrdt(baseText, localText, remoteText) {
    const base = String(baseText || '');
    const local = String(localText || '');
    const remote = String(remoteText || '');

    if (remote === base) {
        return { content: local, merged: false };
    }
    if (local === base) {
        return { content: remote, merged: false };
    }
    if (local === remote) {
        return { content: local, merged: false };
    }

    const baseDoc = createBaseDoc(base);
    const baseUpdate = Y.encodeStateAsUpdate(baseDoc);
    const baseStateVector = Y.encodeStateVector(baseDoc);
    const remoteUpdate = createSnapshotUpdate(baseUpdate, baseStateVector, remote, 2);
    const localUpdate = createSnapshotUpdate(baseUpdate, baseStateVector, local, 3);

    const mergedDoc = new Y.Doc({ gc: false });
    Y.applyUpdate(mergedDoc, baseUpdate);
    Y.applyUpdate(mergedDoc, remoteUpdate);
    Y.applyUpdate(mergedDoc, localUpdate);

    return {
        content: mergedDoc.getText(TEXT_NAME).toString(),
        merged: true
    };
}

module.exports = {
    mergeTextWithCrdt,
    replaceTextSnapshot
};
