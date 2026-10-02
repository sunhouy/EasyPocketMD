const welcome = ['# Welcome to EasyPocketMD\n\nThis is a new document. \n\nStart writing!', '# 欢迎使用 EasyPocketMD\n\n这是一个新的文档。\n\n开始编写吧！'];
export function isUntouchedGuestWelcome(file: any, content: any): boolean {
    if (!file || file.type !== 'file' || file.isExternalLocal || file.contentVersion || file.serverLastModified) return false;
    const automatic = file.autoCreatedGuestWelcome === true || (file.autoCreatedGuestWelcome === undefined && ['Untitled', '未命名文档'].includes(file.name));
    return automatic && welcome.includes(content);
}
export function hasLocalTextChanges(file: any, base: unknown, flagged: boolean): boolean {
    return typeof base === 'string' ? file.content !== base : flagged || file.isSynced === false;
}
