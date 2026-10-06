/** @jest-environment jsdom */
import { showManualPPTExport } from '../../js/ui/ppt-manual-export';
import { downloadGeneratedFile } from '../../js/ui/export';
jest.mock('../../js/ui/export', () => ({ downloadGeneratedFile: jest.fn().mockResolvedValue(undefined) }));

describe('PPT export without preview', () => {
    it('selects a template and downloads directly without opening the editor', async () => {
        document.body.innerHTML = '<div id="pptEditorModal" style="display:none"></div>';
        global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['pptx']) });
        showManualPPTExport('# 本文档', '报告.md');
        const radios = document.querySelectorAll<HTMLInputElement>('input[type=radio]');
        expect(radios).toHaveLength(7);
        const chosen = document.querySelector<HTMLInputElement>('input[value="dark-gold"]')!;
        chosen.checked = true; chosen.dispatchEvent(new Event('change'));
        const reply = document.querySelectorAll<HTMLTextAreaElement>('textarea')[1];
        reply.value = '{"pages":[{"title":"真实标题","layout":"cover"}]}';
        const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === '生成并下载 PPT')!;
        await button.onclick!.call(button, new MouseEvent('click'));
        expect(JSON.parse(String(jest.mocked(fetch).mock.calls[0][1]!.body)).templateId).toBe('dark-gold');
        expect(downloadGeneratedFile).toHaveBeenCalledWith(expect.any(Blob), '报告.pptx', expect.any(String));
        expect(document.getElementById('pptEditorModal')!.style.display).toBe('none');
        expect(document.querySelector('[role=dialog]')).toBeNull();
    });
});
it('updates the copied prompt from slide count inputs and rejects an out-of-range reply', async()=>{
    document.body.innerHTML='';global.fetch=jest.fn();showManualPPTExport('文档全文','报告');
    const inputs=document.querySelectorAll<HTMLInputElement>('input[type=number]');inputs[0].value='3';inputs[1].value='5';inputs[0].dispatchEvent(new Event('input'));
    expect(document.querySelector('textarea').value).toContain('3–5');expect(document.body.textContent).not.toContain('模板改编');
    document.querySelectorAll<HTMLTextAreaElement>('textarea')[1].value='{"pages":[{"title":"一页","layout":"cover"}]}';
    const button=[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent==='生成并下载 PPT');await button.onclick.call(button,new MouseEvent('click'));expect(fetch).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('.epmd-dialog-close').click();
});
