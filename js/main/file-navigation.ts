interface FileNavigationApp {
    currentFileId?: string;
    enterEditorMode?: () => void;
    isFileManagementMode?: boolean;
    enterFileManagementMode?: (options: { refresh: boolean }) => void;
}

const returnToEditor = new WeakSet<object>();
export function clearFileListReturn(app: FileNavigationApp): void { returnToEditor.delete(app); }
export function returnFromPrimaryFileInterface(app: FileNavigationApp): boolean {
    if (!app.isFileManagementMode || !returnToEditor.has(app)) return false;
    returnToEditor.delete(app);
    app.enterEditorMode?.();
    return true;
}

/** Use the same primary file surface from both desktop and mobile file buttons. */
export function openPrimaryFileInterface(app: FileNavigationApp, prefersFileListHome: boolean): void {
    if (prefersFileListHome || app.isFileManagementMode) {
        if (!app.isFileManagementMode && app.currentFileId) returnToEditor.add(app);
        app.enterFileManagementMode?.({ refresh: true });
        return;
    }
    document.getElementById('fileListSidebar')?.classList.toggle('show');
}

export function closeEditorSearch():void {
    const dialog=document.getElementById('findDialogModal') as HTMLElement & {closeFindDialog?:()=>void};
    if(dialog?.closeFindDialog)dialog.closeFindDialog();else dialog?.remove();
}

/** Deleting a file must not navigate to another document or back to a deleted one. */
export function returnToListAfterDeletion(app:any, ids:Set<string>):void {
    if(ids.has(String(app.currentFileId))){app.currentFileId=null;app.deferInitialFileOpen=true;}
    clearFileListReturn(app);closeEditorSearch();app.enterFileManagementMode?.({refresh:true});
}
