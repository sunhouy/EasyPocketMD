interface FileNavigationApp {
    isFileManagementMode?: boolean;
    enterFileManagementMode?: (options: { refresh: boolean }) => void;
}

/** Use the same primary file surface from both desktop and mobile file buttons. */
export function openPrimaryFileInterface(app: FileNavigationApp, prefersFileListHome: boolean): void {
    if (prefersFileListHome || app.isFileManagementMode) {
        app.enterFileManagementMode?.({ refresh: true });
        return;
    }
    document.getElementById('fileListSidebar')?.classList.toggle('show');
}
