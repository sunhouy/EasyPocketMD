/** @jest-environment jsdom */
import { applyEditorNightMode, applyEditorOutline } from '../../js/main/view-settings';

beforeEach(()=>{localStorage.clear();document.body.innerHTML='<button id="modeToggle"></button><button id="desktopOutlineToggleBtn"></button><input type="checkbox" id="showOutlineCheckbox">';document.body.className='';});
it('applies light/dark mode immediately without recreating the editor',()=>{
    const editor={setTheme:jest.fn(),destroy:jest.fn(),vditor:{}};
    const runtime={nightMode:false,userSettings:{},vditor:editor,syncThemeColor:jest.fn()};
    applyEditorNightMode(runtime,true);
    expect(runtime.vditor).toBe(editor);expect(editor.destroy).not.toHaveBeenCalled();
    expect(editor.setTheme).toHaveBeenCalledWith('dark');expect(document.body.classList.contains('night-mode')).toBe(true);
    expect(localStorage.getItem('vditor_night_mode')).toBe('true');
    applyEditorNightMode(runtime,false);expect(editor.setTheme).toHaveBeenLastCalledWith('classic');
    expect(document.body.classList.contains('night-mode')).toBe(false);
});
it('uses the configured content/code themes when changing appearance',()=>{
    const runtime={nightMode:false,userSettings:{vditorCodeTheme:'monokai'},applyVditorThemes:jest.fn()};
    applyEditorNightMode(runtime,true);expect(runtime.applyVditorThemes).toHaveBeenCalledWith(runtime.userSettings);
});
it('toggles the native outline and updates settings and buttons without destroying undo state',()=>{
    const internal={options:{outline:{enable:false}},outline:{toggle:jest.fn()}};
    const editor={destroy:jest.fn(),vditor:internal};
    const runtime={nightMode:false,userSettings:{showOutline:false},vditor:editor};
    applyEditorOutline(runtime,true);
    expect(internal.outline.toggle).toHaveBeenCalledWith(internal,true,false);
    expect(internal.options.outline.enable).toBe(true);expect(editor.destroy).not.toHaveBeenCalled();
    expect((document.getElementById('showOutlineCheckbox') as HTMLInputElement).checked).toBe(true);
    expect(document.getElementById('desktopOutlineToggleBtn').getAttribute('aria-pressed')).toBe('true');
    expect(JSON.parse(localStorage.getItem('vditor_settings')).showOutline).toBe(true);
    applyEditorOutline(runtime,false);expect(internal.outline.toggle).toHaveBeenLastCalledWith(internal,false,false);
});
