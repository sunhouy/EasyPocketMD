/** @jest-environment jsdom */
import { installSettingsRows, createStorageAccessStatus } from '../../js/main/settings-layout';

describe('uniform settings rows', () => {
    it('preserves controls, listeners and accessible labels across repeated opens', () => {
        document.body.innerHTML = `<div id="settings"><details class="settings-section settings-category"><summary class="settings-section-header"><h3>Tools</h3></summary><ul><li class="settings-list-item"><div class="form-group"><label for="mode" data-i18n="theme">Theme</label><select id="mode"><option>dark</option></select></div></li><li class="settings-list-item"><div class="form-group"><label><input id="enabled" type="checkbox"><span data-i18n="enabled">Enabled</span></label></div></li></ul></details><details id="appearance"><summary data-i18n="appearance">Appearance</summary><input id="color"></details></div>`;
        const root = document.getElementById('settings')!;
        const select = document.getElementById('mode')!;
        const listener = jest.fn(); select.addEventListener('change', listener);
        installSettingsRows(root); installSettingsRows(root);
        expect(document.getElementById('mode')).toBe(select);
        select.dispatchEvent(new Event('change')); expect(listener).toHaveBeenCalledTimes(1);
        expect(root.querySelectorAll('.settings-setting-row')).toHaveLength(2);
        expect(root.querySelectorAll('#enabled')).toHaveLength(1);
        expect(root.querySelectorAll('.settings-row-chevron')).toHaveLength(3);
        expect(root.querySelectorAll('.settings-row-icon')).toHaveLength(0);
        expect(root.querySelector('#appearance > summary > span')?.getAttribute('data-i18n')).toBe('appearance');
        expect(root.querySelector('label[for="mode"]')).not.toBeNull();
        expect(root.querySelector('details.settings-category')).toBeNull();
    });
    it('checks authorization without requesting permission and reflects revocation', async () => {
        document.body.innerHTML = '<button><span>Local files</span><i></i></button>';
        const invoke = jest.fn().mockResolvedValueOnce({granted:true}).mockResolvedValueOnce({granted:false}).mockResolvedValueOnce({granted:true});
        const app = {__TAURI__:{core:{invoke}},showMessage:jest.fn()};
        const button = document.querySelector('button')!;
        const refresh = createStorageAccessStatus(button, app);
        await refresh();
        expect(invoke).toHaveBeenLastCalledWith('request_storage_access',{force:false,checkOnly:true});
        expect(button.querySelector('.settings-access-status')?.textContent).toBe('已授权');
        expect(app.showMessage).not.toHaveBeenCalled();
        await refresh(); expect((button.querySelector('.settings-access-status') as HTMLElement).hidden).toBe(true);
        await refresh(true); expect(invoke).toHaveBeenLastCalledWith('request_storage_access',{force:true,checkOnly:false});
        expect(app.showMessage).toHaveBeenCalledWith('已授权','success');
    });
});
