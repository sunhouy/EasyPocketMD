/** Materialize each ancestor rather than leaving synthetic tree-only folders. */
export function materializeParentFolders(files: any[], path: string) {
    const parts = path.split('/'); parts.pop();
    const parents = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
    for (const parent of parents) if (files.some(file => file.name === parent && file.type !== 'folder')) throw new Error('父路径不是文件夹 / Parent path is not a folder: ' + parent);
    const created: any[] = [];
    for (const parent of parents) {
        if (!parent || files.some(file => file.name === parent && file.type === 'folder')) continue;
        const folder = { id: crypto.randomUUID(), name: parent, type: 'folder', content: '', lastModified: Date.now(), isSynced: false };
        files.push(folder); created.push(folder);
    }
    return created;
}
