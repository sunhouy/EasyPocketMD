/** Generate a document-specific prompt, then import an external model's reply. */
export function showManualPPTExport(content: string, filename: string) {
    const global = window as any;
    const en = global.i18n?.getLanguage() === 'en';
    const text = (zh: string, english: string) => en ? english : zh;
    const previousFocus = document.activeElement as HTMLElement;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100100;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;';
    const panel = document.createElement('section');
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
        overlay.remove(); document.removeEventListener('keydown', onKeydown);
        if (restoreFocus && previousFocus?.isConnected) previousFocus.focus();
    };
    const closeButton = button('×', header, () => close());
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
    const prompt = textarea(text('1. 复制提示词（已包含当前文件全文）', '1. Copy prompt (includes the complete current document)'), true, 7);
    prompt.value = text('正在准备提示词…', 'Preparing prompt…');
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.style.cssText = 'font-size:13px;min-height:18px;';
    const copy = button(text('复制提示词', 'Copy prompt'), panel, async () => {
        try { await navigator.clipboard.writeText(prompt.value); status.textContent = text('提示词已复制', 'Prompt copied'); }
        catch { prompt.focus(); prompt.select(); status.textContent = text('无法自动复制，请手动复制已选中的提示词。', 'Please manually copy the selected prompt.'); }
    }); copy.disabled = true;
    const reply = textarea(text('2. 在此粘贴大模型完整输出', '2. Paste the complete model response here'), false, 8);
    reply.placeholder = text('粘贴完整 JSON 或包含 JSON 的回复…', 'Paste the full JSON or response containing JSON…');
    panel.appendChild(status);
    const generate = button(text('解析并生成 PPT', 'Parse and generate PPT'), panel, async () => {
        if (!reply.value.trim()) {
            status.textContent = text('请先粘贴大模型的完整输出。', 'Paste the complete model response first.'); reply.focus(); return;
        }
        generate.disabled = true; generate.textContent = text('正在解析…', 'Parsing…');
        status.textContent = ''; status.style.color = '';
        // Paint the busy state before normalizing and rendering slides.
        await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        if (!overlay.isConnected) return;
        try {
            global.PPTGenerator.importDocumentReply(reply.value, filename);
            close(false);
        } catch (error) {
            const message = text('解析不成功，请重试：请让大模型按提示词重新生成完整 JSON，再完整粘贴。', 'Parsing failed. Please retry: ask the model to regenerate the complete JSON following the prompt, then paste the full response.');
            status.textContent = message; status.style.color = '#e74c3c';
            global.showMessage?.(message, 'error');
            reply.focus();
        } finally {
            generate.disabled = false; generate.textContent = text('解析并生成 PPT', 'Parse and generate PPT');
        }
    }); generate.disabled = true;
    generate.style.background = 'var(--theme-accent,#4a90e2)'; generate.style.color = 'white';
    function onKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key === 'Tab') {
            const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),textarea')];
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
    import('./ppt-generator').then(() => {
        if (!overlay.isConnected) return;
        prompt.value = global.PPTGenerator.buildDocumentPrompt(content, filename);
        copy.disabled = false; generate.disabled = false;
    }).catch(() => {
        if (!overlay.isConnected) return;
        prompt.value = ''; status.textContent = text('PPT 功能加载失败，请关闭后重试。', 'PPT could not load. Close and retry.');
        global.showMessage?.(status.textContent, 'error');
    });
}
