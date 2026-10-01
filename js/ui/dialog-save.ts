/** Let the newly opened dialog paint before doing local or network save work. */
export function afterDialogPaint(): Promise<void> {
    return new Promise(resolve => {
        if (document.hidden || typeof requestAnimationFrame !== 'function') setTimeout(resolve, 0);
        else requestAnimationFrame(() => setTimeout(resolve, 0));
    });
}

export function saveAfterDialogOpens(app: any = window): void {
    const fileId = app.currentFileId;
    if (!fileId || typeof app.saveCurrentFile !== 'function') return;
    void afterDialogPaint().then(async () => {
        if (app.currentFileId !== fileId) return;
        await app.saveCurrentFile(true);
    }).catch(error => {
        console.error('Background document save failed:', error);
        app.showMessage?.((app.i18n?.getLanguage() === 'en' ? 'Save failed: ' : '保存失败: ') + error.message, 'error');
    });
}
