import { computeDiff, renderDiffView, bindCollapsedDiffInteractions } from '../conflict/index';
import { renderMarkdownDiff } from '../conflict/markdown';
export async function showSyncConflict(globalRef: any, file: any, local: string, remote: string, resolve: (content: string) => Promise<void>, disk?: string) {
    document.getElementById('syncConflictPanel')?.remove();
    const panel = document.createElement('section'); panel.id = 'syncConflictPanel'; panel.className = 'sync-conflict-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    const header = document.createElement('header');
    const title = document.createElement('strong'); title.textContent = file.name + ' · 本地 / 云端冲突'; header.appendChild(title);
    const body = document.createElement('div'); body.className = 'sync-conflict-content'; body.textContent = '正在加载差异…';
    const editor = document.createElement('textarea'); editor.value = local; editor.hidden = true; editor.setAttribute('aria-label', '手动合并内容');
    let manual = false, source = false;
    function button(text: string, action: () => void) { const b = document.createElement('button'); b.textContent = text; b.onclick = action; header.appendChild(b); return b; }
    const choose = async (value: string) => { header.querySelectorAll('button').forEach(b => b.disabled = true);
        try { await resolve(value); panel.remove(); } catch (error: any) { globalRef.showMessage?.(error.message, 'error'); header.querySelectorAll('button').forEach(b => b.disabled = false); } };
    button('使用本地', () => void choose(local)); button('使用云端', () => void choose(remote));
    if (disk !== undefined) button('使用原本地文件', () => { editor.value = disk; manual = true; editor.hidden = false; body.hidden = true; });
    button('手动合并', () => { manual = !manual; editor.hidden = !manual; body.hidden = manual; });
    button('保存合并', () => { if (manual) void choose(editor.value); });
    button('源码 / Markdown', () => { source = !source; void render(); });
    button('稍后处理', () => panel.remove());
    panel.append(header, body, editor); document.body.appendChild(panel);
    async function render() { try { const diff = computeDiff(globalRef, local, remote); body.innerHTML = source ? renderDiffView(diff, false, { collapseSame: false }) : await renderMarkdownDiff(diff, false, { collapseSame: false }); bindCollapsedDiffInteractions(body); }
        catch { body.textContent = '差异加载失败；可以使用手动合并，原始内容已保留。'; } }
    await render();
}
