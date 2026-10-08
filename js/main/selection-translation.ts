export async function showSelectionTranslation(text: string, app: any = window) {
    const en = app.i18n?.getLanguage?.() === 'en';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show'; overlay.style.zIndex = '100180';
    overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${en ? 'Translation' : '翻译'}"><button class="epmd-dialog-close modal-close-btn" aria-label="${en ? 'Close' : '关闭'}">×</button><div class="modal-header"><h2>${en ? 'Translation' : '翻译'}</h2></div><div class="modal-form"><label>${en ? 'Target language' : '目标语言'}<select><option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option><option value="ko">한국어</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="es">Español</option></select></label><p role="status" aria-live="polite"></p><textarea readonly rows="8" aria-label="${en ? 'Translation result' : '翻译结果'}"></textarea><button class="modal-btn secondary" data-copy>${en ? 'Copy' : '复制'}</button></div></div>`;
    const target = overlay.querySelector('select')!;
    const status = overlay.querySelector('[role=status]')!;
    const result = overlay.querySelector('textarea')!;
    const copy = overlay.querySelector<HTMLButtonElement>('[data-copy]')!;
    target.value = /[\u3400-\u9fff]/.test(text) ? 'en' : 'zh';
    let controller: AbortController | null = null;
    const previousFocus = document.activeElement as HTMLElement;
    const close = () => { controller?.abort(); overlay.remove(); document.removeEventListener('keydown', keydown); previousFocus?.focus({preventScroll:true}); };
    const keydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key === 'Tab') {
            const controls = Array.from(overlay.querySelectorAll<HTMLElement>('button:not(:disabled),select,textarea'));
            const index = controls.indexOf(document.activeElement as HTMLElement);
            if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1)?.focus(); }
            else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0]?.focus(); }
        }
    };
    overlay.querySelector<HTMLButtonElement>('.modal-close-btn')!.onclick = close;
    document.body.append(overlay); document.addEventListener('keydown', keydown); target.focus();
    const translate = async () => {
        controller?.abort(); const request = new AbortController(); controller = request;
        status.textContent = en ? 'Translating…' : '翻译中…'; result.value = ''; copy.disabled = true;
        try {
            const token = app.currentUser?.token;
            const response = await fetch(app.getApiBaseUrl() + '/translate', {
                method: 'POST', headers: {'Content-Type':'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})},
                body: JSON.stringify({text, target: target.value}), signal: request.signal
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw Error(data.message || (en ? 'Translation failed' : '翻译失败'));
            if (request.signal.aborted || !overlay.isConnected) return;
            result.value = data.data.text; copy.disabled = false; status.textContent = en ? 'Translated by Tencent Cloud' : '腾讯云翻译';
        } catch (error) { if (!request.signal.aborted) status.textContent = String((error as Error).message); }
    };
    target.onchange = () => { void translate(); };
    copy.onclick = () => { if (!navigator.clipboard?.writeText) { result.focus(); result.select(); return; } void navigator.clipboard.writeText(result.value).then(() => app.showMessage?.(en ? 'Copied' : '已复制', 'success')).catch(() => { result.focus(); result.select(); }); };
    await translate();
}
