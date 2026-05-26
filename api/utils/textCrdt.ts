const DiffMatchPatch = require('diff-match-patch');

const dmp = new DiffMatchPatch();

function normalizeText(text) {
    return String(text || '');
}

function splitChars(text) {
    return Array.from(normalizeText(text));
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

function rangesOverlap(left, right) {
    const leftEnd = left.start + left.deleteLength;
    const rightEnd = right.start + right.deleteLength;
    if (left.deleteLength === 0 && right.deleteLength === 0) {
        return left.start === right.start;
    }
    return left.start < rightEnd && right.start < leftEnd;
}

function applyPatchRange(text, patch) {
    return text.slice(0, patch.start) + patch.insertText + text.slice(patch.start + patch.deleteLength);
}

function applyNonOverlappingRanges(base, localPatch, remotePatch) {
    const patches = [
        { patch: localPatch, order: 1 },
        { patch: remotePatch, order: 0 }
    ].sort((a, b) => {
        if (a.patch.start !== b.patch.start) return b.patch.start - a.patch.start;
        return b.order - a.order;
    });

    return patches.reduce((text, item) => applyPatchRange(text, item.patch), base);
}

function hasMeaningfulBase(base, local, remote) {
    if (!base) return false;
    if (base.length < 32) {
        const maxDeletedBase = Math.max(1, Math.floor(base.length * 0.5));
        return findPatchRange(base, local).deleteLength <= maxDeletedBase &&
            findPatchRange(base, remote).deleteLength <= maxDeletedBase;
    }

    const sampleLength = Math.min(64, Math.max(16, Math.floor(base.length / 8)));
    const anchors = [
        base.slice(0, sampleLength),
        base.slice(Math.max(0, Math.floor((base.length - sampleLength) / 2)), Math.max(0, Math.floor((base.length - sampleLength) / 2)) + sampleLength),
        base.slice(base.length - sampleLength)
    ].filter(Boolean);

    return anchors.some(anchor => local.includes(anchor)) && anchors.some(anchor => remote.includes(anchor));
}

function isSnapshotConcat(candidate, local, remote) {
    if (!candidate || !local || !remote) return false;
    if (candidate === local || candidate === remote) return false;
    if (candidate === local + remote || candidate === remote + local) return true;
    if (candidate === local + '\n' + remote || candidate === remote + '\n' + local) return true;

    const minSnapshotLength = Math.min(local.length, remote.length);
    if (minSnapshotLength < 64) return false;

    const localIndex = candidate.indexOf(local);
    const remoteIndex = candidate.indexOf(remote);
    if (localIndex === -1 || remoteIndex === -1 || localIndex === remoteIndex) return false;

    const localEnd = localIndex + local.length;
    const remoteEnd = remoteIndex + remote.length;
    const overlap = Math.max(0, Math.min(localEnd, remoteEnd) - Math.max(localIndex, remoteIndex));
    const mostlySeparate = overlap < minSnapshotLength * 0.2;
    const mostlyOnlySnapshots = candidate.length >= (local.length + remote.length - overlap) * 0.9;

    return mostlySeparate && mostlyOnlySnapshots;
}

function chooseSnapshot(local, remote) {
    if (local.includes(remote) && local.length >= remote.length) return local;
    if (remote.includes(local) && remote.length > local.length) return remote;
    return local;
}

function mergeWithDiffPatch(base, local, remote) {
    const patches = dmp.patch_make(base, local);
    if (!patches.length) return remote;

    const result = dmp.patch_apply(patches, remote);
    const patched = result[0];
    const applied = result[1] || [];
    if (!applied.every(Boolean)) return null;
    if (isSnapshotConcat(patched, local, remote)) return null;
    return patched;
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

    if (!hasMeaningfulBase(base, local, remote)) {
        return { content: chooseSnapshot(local, remote), merged: false };
    }

    const localPatch = findPatchRange(base, local);
    const remotePatch = findPatchRange(base, remote);

    if (!rangesOverlap(localPatch, remotePatch)) {
        const merged = applyNonOverlappingRanges(base, localPatch, remotePatch);
        if (!isSnapshotConcat(merged, local, remote)) {
            return { content: merged, merged: true };
        }
    }

    const patched = mergeWithDiffPatch(base, local, remote);
    if (typeof patched === 'string') {
        return { content: patched, merged: true };
    }

    return { content: chooseSnapshot(local, remote), merged: false };
}

module.exports = {
    mergeTextWithCrdt
};
