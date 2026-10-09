export type ClipboardContent = { text: string; html?: string };
function androidInvoke() {
    const app = window as any;
    return /Android/i.test(navigator.userAgent) ? app.__TAURI__?.core?.invoke || app.__TAURI__?.invoke || app.__TAURI_INTERNALS__?.invoke : undefined;
}
export function canReadClipboard(): boolean { return !!(androidInvoke() || navigator.clipboard?.readText); }
export async function readClipboardText(): Promise<string> {
    const invoke = androidInvoke();
    if (invoke) return (await invoke('editor_clipboard_action', {action:'read', text:'', html:null})).text;
    if (!navigator.clipboard?.readText) throw Error('当前环境无法读取剪贴板，请使用系统粘贴');
    return navigator.clipboard.readText();
}
/** Preserve Markdown and rich HTML; Android writes directly without selecting hidden inputs. */
export async function copyContent(content: ClipboardContent): Promise<void> {
    const invoke = androidInvoke();
    if (invoke) { await invoke('editor_clipboard_action', {action:'write', text:content.text, html:content.html || null}); return; }
    if (content.html && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        try {
            await navigator.clipboard.write([new ClipboardItem({
                'text/plain':new Blob([content.text], {type:'text/plain'}),
                'text/html':new Blob([content.html], {type:'text/html'}),
            })]); return;
        } catch { /* Keep both formats through the copy event below. */ }
    } else if (!content.html && navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(content.text); return; } catch { /* Legacy browser path. */ }
    }
    const active = document.activeElement as HTMLElement | null;
    const selection = document.getSelection();
    const ranges = selection ? Array.from({length:selection.rangeCount}, (_,i)=>selection.getRangeAt(i).cloneRange()) : [];
    const node = document.createElement('div');
    node.textContent = content.text || '\u200b';
    node.style.cssText = 'position:fixed;left:-10000px;top:0;user-select:text;-webkit-user-select:text;';
    document.body.append(node); document.body.classList.add('epmd-copying');
    const onCopy = (event: ClipboardEvent) => {
        if (!event.clipboardData) return;
        event.preventDefault(); event.stopImmediatePropagation();
        event.clipboardData.setData('text/plain',content.text);
        if (content.html) event.clipboardData.setData('text/html',content.html);
    };
    document.addEventListener('copy',onCopy,true);
    try {
        const range=document.createRange();range.selectNodeContents(node);selection?.removeAllRanges();selection?.addRange(range);
        // Do not focus/select a textarea: mobile browsers show their own copy/paste popup for it.
        if (!document.execCommand?.('copy')) throw Error('Clipboard unavailable');
    } finally {
        document.removeEventListener('copy',onCopy,true);node.remove();document.body.classList.remove('epmd-copying');
        selection?.removeAllRanges();
        ranges.filter(range=>range.startContainer.isConnected && range.endContainer.isConnected).forEach(range=>selection?.addRange(range));
        if (active?.isConnected && document.activeElement !== active) active.focus({preventScroll:true});
    }
}
export function copyText(text: string): Promise<void> { return copyContent({text}); }
