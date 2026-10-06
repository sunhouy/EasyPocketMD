import { PPT_TEMPLATES } from '../../shared/ppt-templates';
import { buildDocumentPPTPrompt, parseDocumentPPTReply, generateDocumentPPT, parsePPTPageRange } from './ppt-document';
import { downloadGeneratedFile } from './export';

/** Generate a document-specific prompt, then import an external model's reply. */
export function showManualPPTExport(content: string, filename: string) {
    const global = window;
    let activeRequest: AbortController | undefined;
    const en = global.i18n?.getLanguage() === 'en';
    const text = (zh: string, english: string) => en ? english : zh;
    const previousFocus = document.activeElement as HTMLElement;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;';
    const panel = document.createElement('section');
    panel.className='ppt-export-dialog';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', text('导出 PPT', 'Export PPT'));
    panel.style.cssText = 'width:100%;max-width:760px;max-height:95dvh;overflow:auto;padding:20px;box-sizing:border-box;border-radius:12px;background:var(--modal-bg,#fff);color:var(--text-color,#333);';
    if (global.nightMode) { panel.style.background = '#2d2d2d'; panel.style.color = '#eee'; }
    overlay.appendChild(panel);
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;';
    const title = document.createElement('h2'); title.textContent = text('导出 PPT', 'Export PPT');
    title.style.cssText = 'font-size:18px;margin:0;'; header.appendChild(title); panel.appendChild(header);
    function button(label: string, parent: HTMLElement, action: () => void) {
        const element = document.createElement('button'); element.type = 'button'; element.textContent = label;
        element.style.cssText = 'padding:8px 12px;border:1px solid #888;border-radius:6px;background:transparent;color:inherit;cursor:pointer;';
        element.onclick = action; parent.appendChild(element); return element;
    }
    const close = (restoreFocus = true) => {
        activeRequest?.abort();
        overlay.remove(); document.removeEventListener('keydown', onKeydown);
        if (restoreFocus && previousFocus?.isConnected) previousFocus.focus();
    };
    const closeButton = button('×', header, () => close());
    closeButton.classList.add('epmd-dialog-close');
    closeButton.setAttribute('aria-label', text('关闭', 'Close'));
    const description = document.createElement('p');
    description.textContent = text('请将下面内容发送给一个文本大模型，如 DeepSeek、豆包、千问等，然后将输出文本完整粘贴在此处，进行 PPT 生成和解析。', 'Send the prompt below to a text model such as DeepSeek, Doubao or Qwen, then paste its complete response here to generate the PPT.');
    panel.appendChild(description);
    function textarea(label: string, readonly: boolean, rows: number) {
        const wrapper = document.createElement('label'); wrapper.textContent = label;
        wrapper.style.cssText = 'display:block;margin:14px 0 8px;font-size:14px;';
        const input = document.createElement('textarea'); input.readOnly = readonly; input.rows = rows;
        input.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:10px;border:1px solid #888;border-radius:6px;resize:vertical;background:transparent;color:inherit;font:13px monospace;';
        wrapper.appendChild(input); panel.appendChild(wrapper); return input;
    }
    const rangeLabel = document.createElement('label'); rangeLabel.className = 'ppt-page-range';
    rangeLabel.textContent = text('PPT 页数范围（可选，包含封面和总结）', 'Slide count range (optional, includes cover and summary)');
    const minPages = document.createElement('input'), maxPages = document.createElement('input');
    for (const input of [minPages, maxPages]) { input.type='number'; input.min='1'; input.max='100'; input.step='1'; }
    minPages.placeholder=text('最少页数','Minimum'); maxPages.placeholder=text('最多页数','Maximum');
    minPages.setAttribute('aria-label',minPages.placeholder); maxPages.setAttribute('aria-label',maxPages.placeholder);
    rangeLabel.append(minPages, ' – ', maxPages); panel.append(rangeLabel);
    const pageRange = () => parsePPTPageRange(minPages.value,maxPages.value);
    const prompt = textarea(text('1. 复制提示词（已包含当前文件全文）', '1. Copy prompt (includes the complete current document)'), true, 7);
    prompt.value = buildDocumentPPTPrompt(content, filename);
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.style.cssText = 'font-size:13px;min-height:18px;';
    const copy = button(text('复制提示词', 'Copy prompt'), panel, async () => {
        try { await navigator.clipboard.writeText(prompt.value); status.textContent = text('提示词已复制', 'Prompt copied'); }
        catch { prompt.focus(); prompt.select(); status.textContent = text('无法自动复制，请手动复制已选中的提示词。', 'Please manually copy the selected prompt.'); }
    }); copy.disabled = !content.trim();
    const updatePrompt = () => {
        try { prompt.value=buildDocumentPPTPrompt(content,filename,pageRange()); copy.disabled=!content.trim(); status.textContent=''; }
        catch { copy.disabled=true; prompt.value=''; status.textContent=text('页数须为 1–100 的整数，最少页数不能大于最多页数。','Use integers from 1–100; minimum must not exceed maximum.'); }
    };
    minPages.oninput=updatePrompt; maxPages.oninput=updatePrompt;
    const reply = textarea(text('2. 在此粘贴大模型完整输出', '2. Paste the complete model response here'), false, 8);
    reply.placeholder = text('粘贴完整 JSON 或包含 JSON 的回复…', 'Paste the full JSON or response containing JSON…');
    panel.appendChild(status);
    const templates = document.createElement('fieldset');
    templates.className = 'ppt-template-picker';
    const legend = document.createElement('legend'); legend.textContent = text('3. 选择模板', '3. Choose a template');
    templates.appendChild(legend);
    let templateId = PPT_TEMPLATES[0].id;
    const grid = document.createElement('div'); grid.className = 'ppt-template-grid'; templates.appendChild(grid);
    PPT_TEMPLATES.forEach((template, index) => {
        const label = document.createElement('label'); label.className = 'ppt-template-option';
        const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'ppt-export-template';
        radio.value = template.id; radio.checked = index === 0;
        radio.onchange = () => { templateId = radio.value; };
        const sample = document.createElement('span'); sample.className = 'ppt-template-swatch';
        sample.style.background = template.style === 'layered'
            ? `linear-gradient(135deg,#${template.bg},#${template.secondary}55,#${template.accent}88)`
            : `linear-gradient(90deg,#${template.style === 'split' ? template.bg : template.accent} 50%,#${template.style === 'split' ? template.accent : template.bg} 50%)`;
        sample.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span'); name.textContent = en ? template.nameEn : template.name;
        label.append(radio, sample, name); grid.appendChild(label);
    });
    panel.insertBefore(templates, status);
    const filenameLabel = document.createElement('label'); filenameLabel.textContent = text('文件名', 'File name');
    filenameLabel.style.cssText = 'display:flex;align-items:center;gap:8px;margin:14px 0;';
    const filenameInput = document.createElement('input'); filenameInput.type = 'text'; filenameInput.value = filename.replace(/\.md$/i, '');
    filenameInput.style.cssText = 'min-width:0;flex:1;padding:8px;border:1px solid #888;border-radius:6px;background:transparent;color:inherit;';
    filenameLabel.append(filenameInput, '.pptx'); panel.insertBefore(filenameLabel, status);
    const generateLabel = text('生成并下载 PPT', 'Generate and download PPT');
    const generate = button(generateLabel, panel, async () => {
        let documentPPT;
        try { documentPPT = parseDocumentPPTReply(reply.value, filename); const range=pageRange(); if(range && (documentPPT.pages.length<range.min || documentPPT.pages.length>range.max)) throw new Error('page range'); }
        catch {
            status.textContent = text('解析不成功，请重试：让大模型按页数范围重新生成完整 JSON，再完整粘贴。', 'Parsing failed. Retry with the complete JSON from the model.');
            status.style.color = '#e74c3c'; global.showMessage?.(status.textContent, 'error'); reply.focus(); return;
        }
        generate.disabled = true; templates.disabled = true;
        generate.textContent = text('正在生成…', 'Generating…');
        status.textContent = text('正在生成 PPT，完成后直接下载…', 'Generating PPT. The file will download directly…'); status.style.color = '';
        activeRequest = new AbortController(); const timer = setTimeout(() => activeRequest?.abort(), 120000);
        try {
            const blob = await generateDocumentPPT(documentPPT, templateId, activeRequest.signal);
            if (!overlay.isConnected) return;
            const name = (filenameInput.value.trim().replace(/\.pptx$/i, '') || filename || 'PPT').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120);
            await downloadGeneratedFile(blob, name + '.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
            close(false);
        } catch (error) {
            if (!overlay.isConnected) return;
            status.textContent = text('PPT 导出失败，请重试：', 'PPT export failed. Please retry: ') + (error instanceof Error ? error.message : String(error));
            status.style.color = '#e74c3c'; global.showMessage?.(status.textContent, 'error');
        } finally {
            clearTimeout(timer); activeRequest = undefined;
            generate.disabled = false; templates.disabled = false; generate.textContent = generateLabel;
        }
    });
    generate.disabled = !content.trim();
    generate.style.background = 'var(--theme-accent,#4a90e2)'; generate.style.color = 'white';
    function onKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key === 'Tab') {
            const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input:not(:disabled)')];
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    }
    document.addEventListener('keydown', onKeydown); document.body.appendChild(overlay); closeButton.focus();
    if (!content.trim()) {
        prompt.value = ''; status.textContent = text('当前文件为空，请添加内容后重试。', 'The document is empty. Add content and retry.');
        return;
    }
}
