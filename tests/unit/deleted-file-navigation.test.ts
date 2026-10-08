/** @jest-environment jsdom */
import {openPrimaryFileInterface,returnFromPrimaryFileInterface,returnToListAfterDeletion,closeEditorSearch} from '../../js/main/file-navigation';
it('returns to the list instead of another document after deleting the open file',()=>{
 const app:any={currentFileId:'deleted',isFileManagementMode:false,enterEditorMode:jest.fn(),enterFileManagementMode:jest.fn(()=>{app.isFileManagementMode=true;})};
 openPrimaryFileInterface(app,true);returnToListAfterDeletion(app,new Set(['deleted']));expect(app.currentFileId).toBeNull();expect(app.enterFileManagementMode).toHaveBeenLastCalledWith({refresh:true});expect(returnFromPrimaryFileInterface(app)).toBe(false);expect(app.enterEditorMode).not.toHaveBeenCalled();
});
it('retains the current document when deleting another, but still returns to the list',()=>{
 const app:any={currentFileId:'kept',enterFileManagementMode:jest.fn()};returnToListAfterDeletion(app,new Set(['other']));expect(app.currentFileId).toBe('kept');expect(app.enterFileManagementMode).toHaveBeenCalled();
});
it('runs the search cleanup so highlights, listeners and floating layout are destroyed',()=>{
 document.body.innerHTML='<div id="findDialogModal"></div>';const dialog:any=document.getElementById('findDialogModal');dialog.closeFindDialog=jest.fn(()=>dialog.remove());closeEditorSearch();expect(dialog.closeFindDialog).toHaveBeenCalled();expect(document.getElementById('findDialogModal')).toBeNull();
});
