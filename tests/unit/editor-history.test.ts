/** @jest-environment jsdom */
import { installEditorHistory, setEditorFileValue } from '../../js/editor-history';
import { installEditorRuntime } from '../../js/files/editor-runtime';

function fixture() {
    document.body.innerHTML = '<button id="other">File B</button><div contenteditable="true" tabindex="0"><p>abc</p></div>';
    const root = document.querySelector('div')!;
    const internal:any = {currentMode:'wysiwyg', wysiwyg:{element:root}, lute:{Md2VditorDOM:jest.fn()}};
    const history:any = {addToUndoStack:jest.fn(), undo:jest.fn(), redo:jest.fn()}; internal.undo = history;
    const instance:any = {vditor:internal, getValue:()=>root.textContent, setValue:jest.fn((text, clear) => {root.innerHTML='';root.textContent=text;if(clear)history.addToUndoStack(internal);})};
    const select = (offset:number) => {root.focus(); const range=document.createRange();range.setStart(root.firstChild.nodeType===3?root.firstChild:root.firstChild!.firstChild!,offset);range.collapse(true);document.getSelection()!.removeAllRanges();document.getSelection()!.addRange(range);};
    return {instance,internal,history,root,select,add:history.addToUndoStack,undo:history.undo,redo:history.redo};
}
afterEach(() => {jest.useRealTimers();});
it('flushes rapid typing before undo, cancels stale records and repairs a caret outside the editor', () => {
    jest.useFakeTimers();jest.spyOn(window,'scrollTo').mockImplementation(()=>{});
    const {instance,internal,history,root,select,add,undo}=fixture();
    installEditorHistory(instance);root.innerHTML='<p>abcd</p>';select(4);
    const delayed=jest.fn();internal.wysiwyg.afterRenderTimeoutId=setTimeout(delayed,1000);
    undo.mockImplementation(()=>{root.innerHTML='<p>abc</p>';const range=document.createRange();range.setStartBefore(root);range.collapse(true);document.getSelection()!.removeAllRanges();document.getSelection()!.addRange(range);});
    history.undo(internal);jest.runAllTimers();
    expect(add).toHaveBeenCalledTimes(1);expect(delayed).not.toHaveBeenCalled();
    expect(root.contains(document.getSelection()!.anchorNode)).toBe(true);expect(document.getSelection()!.anchorOffset).toBe(3);
});
it('keeps the historical caret produced by redo and does not record cursor movement as an edit', () => {
    const {instance,internal,history,root,select,add,redo}=fixture();installEditorHistory(instance);select(2);
    redo.mockImplementation(()=>{root.innerHTML='<p>abcd</p>';select(1);});history.redo(internal);
    expect(add).not.toHaveBeenCalled();expect(document.getSelection()!.anchorOffset).toBe(1);
});
it('resets history on a file switch even when documents have identical contents and ignores stale file writes', () => {
    const {instance,internal}=fixture();
    const app:any={currentFileId:'a',vditor:instance}; const runtime=installEditorRuntime(app,{});
    runtime.setEditorContentForFile('a','same');instance.setValue.mockClear();app.currentFileId='b';
    runtime.setEditorContentForFile('b','same');expect(instance.setValue).toHaveBeenCalledWith('same',true);
    instance.setValue.mockClear();runtime.setEditorContentForFile('a','stale');expect(instance.setValue).not.toHaveBeenCalled();expect(internal.wysiwyg.element.textContent).toBe('same');
});
it('cancels pending callbacks from an old file before resetting history', () => {
    jest.useFakeTimers();const {instance,internal}=fixture();const stale=jest.fn();internal.wysiwyg.afterRenderTimeoutId=setTimeout(stale,1000);
    setEditorFileValue(instance,'file B',true);jest.runAllTimers();expect(stale).not.toHaveBeenCalled();expect(instance.setValue).toHaveBeenCalledWith('file B',true);
});
