/** @jest-environment jsdom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { uiMessages, setUiText, uiText } from '../../js/i18n-messages';
import { floatingRunWindow } from '../../js/code-runner-window';

beforeAll(() => { require('../../js/translations'); window.i18n.init(); });
afterEach(() => { document.body.replaceChildren(); window.i18n.setLanguage('zh'); });

it('provides Chinese and English for every static interface translation key', () => {
    const documentHtml = new DOMParser().parseFromString(readFileSync(resolve('index.html'), 'utf8'), 'text/html');
    for (const language of ['zh','en']) {
        window.i18n.setLanguage(language);
        for (const element of documentHtml.querySelectorAll('[data-i18n],[data-i18n-title],[data-i18n-placeholder],[data-i18n-aria-label]')) {
            for (const attribute of element.attributes) {
                if (!attribute.name.startsWith('data-i18n')) continue;
                expect({language,key:attribute.value,exists:window.i18n.has(attribute.value)}).toEqual({language,key:attribute.value,exists:true});
            }
        }
        for (const source of Object.keys(uiMessages)) expect(window.i18n.has('ui:'+source)).toBe(true);
    }
});

it('updates text, tooltips, placeholders and accessibility labels in an open dialog', () => {
    document.body.innerHTML='<button data-i18n="ui:协作编辑记录" data-i18n-title="ui:显示/隐藏大纲" data-i18n-aria-label="ui:分享"></button><input data-i18n-placeholder="ui:代码语言">';
    const button=document.createElement('button');setUiText(button,uiText('下载'));document.body.append(button);
    window.i18n.setLanguage('en');
    expect(button.textContent).toBe('Download');
    expect(document.querySelector('button').textContent).toBe('Collaboration history');
    expect(document.querySelector('button').title).toBe('Show/hide outline');
    expect(document.querySelector('button').getAttribute('aria-label')).toBe('Share');
    expect(document.querySelector('input').placeholder).toBe('Code language');
    window.i18n.setLanguage('zh');expect(button.textContent).toBe('下载');
});

it('resizes floating dialogs by keyboard and cleans up viewport listeners on close', () => {
    const remove=jest.spyOn(window,'removeEventListener');
    const panel=document.createElement('div'),header=document.createElement('div');panel.append(header);document.body.append(panel);
    const controller=floatingRunWindow(panel,header,{x:20,y:20,width:336,height:280});controller.update(false,false);
    const handle=panel.querySelector('[role="button"]');
    handle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    expect(panel.style.width).toBe('346px');
    handle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
    expect(panel.style.height).toBe('270px');
    controller.update(true,false);expect(panel.style.width).toBe(window.innerWidth-16+'px');
    controller.update(false,false);expect(panel.style.width).toBe('346px');
    controller.destroy();expect(panel.querySelector('[role="button"]')).toBeNull();
    expect(remove).toHaveBeenCalledWith('resize',expect.any(Function));
});
