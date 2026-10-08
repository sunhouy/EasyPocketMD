/** Publish the first home list only after cached drafts, cloud metadata and orders settle. */
export async function initializeFileList(app:any, load:()=>Promise<unknown>) {
    const session={};app.initialFileListSession=session;
    app.fileListInitializing=!!app.startInFileManagementMode;
    app.refreshNotesHome?.();
    try {await load();}
    finally {
        if(app.initialFileListSession===session){app.fileListInitializing=false;app.loadFiles?.();}
    }
}
