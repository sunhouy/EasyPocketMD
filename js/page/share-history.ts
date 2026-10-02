import { computeDiff } from '../files/conflict';
import { renderMarkdownDiff } from '../files/conflict/markdown';

export async function showSharedEditHistory(getState: () => any, refresh: (data?: any) => void) {
    if (!getState()) return;
    document.getElementById('shareHistoryModal')?.remove();
    const overlay = document.createElement('div'); overlay.id = 'shareHistoryModal'; overlay.className = 'share-history-overlay';
    const dialog = document.createElement('section'); dialog.className = 'share-history-dialog'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    const header = document.createElement('header'); header.className = 'share-history-header';
    const title = document.createElement('strong'); title.textContent = '文档协作历史';
    const filter = document.createElement('select'); filter.setAttribute('aria-label', '按编辑者筛选');
    const close = document.createElement('button'); close.className = 'share-close-btn'; close.textContent = '关闭'; close.onclick = () => overlay.remove();
    header.append(title, filter, close);
    const message = document.createElement('div'); message.className = 'share-history-message'; message.setAttribute('role', 'status');
    const content = document.createElement('div'); content.className = 'share-history-content'; content.textContent = '加载中…';
    dialog.append(header, message, content); overlay.append(dialog); document.body.append(overlay);
    const state = getState(); let selected = '', data: any;
    async function request(action: string, extra: any = {}) {
        const user = (window as any).currentUser;
        const response = await fetch(((window as any).getApiBaseUrl?.() || 'api') + '/share/' + action, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(user?.token ? { Authorization: 'Bearer ' + user.token } : {}) },
            body: JSON.stringify({ share_id: state.shareId, password: state.sharePassword, edit_password: state.editPassword, viewer_id: state.viewerId,
                username: user?.username, token: user?.token, editor_username: user?.username, editor_token: user?.token, ...extra })
        });
        const result = await response.json();
        if (result.code !== 200) throw new Error(result.message || '操作失败');
        return result.data;
    }
    async function manage(button: HTMLButtonElement, action: string, target: any) {
        button.disabled = true; message.textContent = '处理中…';
        try {
            const app = window as any;
            if (action === 'undo' && state.canEdit && app.vditor?.getValue() !== state.lastKnownContent) {
                if (state.isSaving) throw new Error('文档正在保存，请稍后重试撤销。');
                if (typeof app.scheduleSharedDocSync === 'function' && !await app.scheduleSharedDocSync({ manualSave: true })) throw new Error('当前编辑尚未保存，请先保存后撤销。');
            }
            const result = await request(action, target);
            if (getState()?.shareId === state.shareId) refresh(result); message.textContent = action === 'undo' ? '已撤销目标改动，其他人的后续编辑已保留。' : '编辑权限已更新。';
            await load();
        } catch (error: any) { message.textContent = error.message; }
        finally { button.disabled = false; }
    }
    function button(text: string, action: string, target: any) {
        const element = document.createElement('button'); element.textContent = text;
        element.onclick = () => {
            if (action === 'undo' && !window.confirm('撤销所选编辑？将保留其他用户的后续改动；重叠改动需要手动处理。')) return;
            void manage(element, action, target);
        };
        return element;
    }
    function render() {
        filter.replaceChildren();
        const all = document.createElement('option'); all.value = ''; all.textContent = '所有编辑者'; filter.append(all);
        for (const editor of data.editors) {
            const option = document.createElement('option'); option.value = editor.actor_key; option.textContent = editor.actor_name; filter.append(option);
        }
        filter.value = selected; content.replaceChildren();
        const editors = document.createElement('details');
        const summary = document.createElement('summary'); summary.textContent = '编辑者及权限（' + data.editors.length + '）'; editors.append(summary);
        for (const editor of data.editors) {
            const row = document.createElement('div'); row.className = 'share-history-editor';
            const name = document.createElement('strong'); name.textContent = editor.actor_name;
            const actions = document.createElement('div'); actions.className = 'share-history-actions';
            const info = document.createElement('span'); info.textContent = editor.edit_count + ' 次编辑' + (Number(editor.blocked) ? ' · 编辑权限已关闭' : ''); actions.append(info);
            if (data.can_manage) {
                actions.append(button('撤销此用户编辑', 'undo', { actor_key: editor.actor_key }));
                if (editor.actor_key !== 'user:' + state.ownerUsername) actions.append(button(Number(editor.blocked) ? '恢复编辑权限' : '关闭编辑权限', 'editor-permission', { actor_key: editor.actor_key, revoked: !Number(editor.blocked) }));
            }
            row.append(name, actions); editors.append(row);
        }
        content.append(editors);
        const events = data.events.filter((event: any) => !selected || event.actor_key === selected);
        if (!events.length) { const empty = document.createElement('p'); empty.textContent = '暂无协作编辑记录；旧版本未记录的编辑者无法追溯。'; content.append(empty); }
        for (const event of events) {
            const row = document.createElement('article'); row.className = 'share-history-event';
            const name = document.createElement('strong'); name.textContent = event.actor_name + ' · 版本 ' + event.content_version + (event.kind === 'undo' ? ' · 撤销操作' : '') + (event.undone_by ? ' · 已撤销' : '');
            const actions = document.createElement('div'); actions.className = 'share-history-actions';
            const date = document.createElement('time'); date.textContent = new Date(event.created_at).toLocaleString(); actions.append(date);
            if (data.can_manage && event.kind === 'edit' && !event.undone_by) actions.append(button('撤销这次编辑', 'undo', { event_id: event.id }));
            const preview = document.createElement('details'); const label = document.createElement('summary'); label.textContent = '查看具体改动'; preview.append(label);
            const diff = document.createElement('div'); diff.className = 'share-history-diff'; preview.append(diff);
            preview.addEventListener('toggle', async () => {
                if (!preview.open || diff.dataset.ready) return;
                diff.textContent = '加载中…';
                try { const detail = await request('history-event', { event_id: event.id }); diff.innerHTML = await renderMarkdownDiff(computeDiff(window, detail.before_content, detail.after_content), false, { collapseSame: false }); diff.dataset.ready = 'true'; }
                catch { diff.textContent = '差异渲染失败，请重试'; }
            });
            row.append(name, actions, preview); content.append(row);
        }
        if (data.next_id) { const more = document.createElement('button'); more.textContent = '加载更早的编辑记录'; more.onclick = () => { more.disabled = true; void load(true); }; content.append(more); }
        const note = document.createElement('p'); note.textContent = '访客权限按浏览器会话管理；需要跨设备管理时，请使用账号编辑。'; note.style.fontSize = '12px'; content.append(note);
    }
    async function load(older = false) {
        try { const next = await request('history', { actor_key: selected, before_id: older ? data.next_id : undefined });
            if (older) next.events = [...data.events, ...next.events];
            data = next; if (overlay.isConnected) render(); }
        catch (error: any) { content.textContent = error.message; }
    }
    filter.onchange = () => { selected = filter.value; content.textContent = '加载中…'; void load(); };
    await load();
}
