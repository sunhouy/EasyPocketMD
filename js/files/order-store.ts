import { isOrderMetadataFile, normalizeOrders } from '../../shared/file-orders';
export { isOrderMetadataFile, normalizeOrders } from '../../shared/file-orders';
type Orders = Record<string, number>;
export function reorderSiblings(paths: string[], path: string, direction: 'up'|'down'): Orders | null {
    const index = paths.indexOf(path), target = index + (direction === 'up' ? -1 : 1);
    if (index < 0 || target < 0 || target >= paths.length) return null;
    const reordered = paths.slice();[reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    return Object.fromEntries(reordered.map((name, i) => [name, i * 10]));
}
/** Sort metadata has its own account-scoped cache and API; it is never a document draft. */
export function createFileOrderStore(app: any, changed: () => void) {
    let account: string | undefined, orders: Orders = normalizeOrders({}), pending: Orders = normalizeOrders({}), loaded = false;
    let loading: Promise<void> | undefined, sending: Promise<void> | undefined;
    const username = () => app.currentUser?.username || '';
    const key = () => 'epmd-file-orders:' + encodeURIComponent(account || '');
    const persist = () => {
        try {localStorage.setItem(key(), JSON.stringify({orders, pending}));}
        catch (error) {console.warn('排序缓存空间不足，仍将尝试同步云端', error);}
    };
    const apply = () => {
        app.fileOrders = orders;
        for (const file of app.files || []) {if (Object.hasOwn(orders, file.name)) file.order = orders[file.name];else delete file.order;}
    };
    function initialize() {
        if (account !== username()) {
            account = username();orders = normalizeOrders({});pending = normalizeOrders({});loaded = false;loading = undefined;sending = undefined;
            try { const saved = JSON.parse(localStorage.getItem(key()) || '{}');orders = normalizeOrders(saved.orders);pending = normalizeOrders(saved.pending); } catch {}
        }
        // Migrate both historical spellings, removing their draft/conflict state from the workspace.
        for (const file of [...(app.files || [])]) if (isOrderMetadataFile(file.name)) {
            try {
                const old = normalizeOrders(JSON.parse(file.content || '{}'));
                for (const [path, order] of Object.entries(old)) if (!Object.hasOwn(orders, path)) {orders[path] = order;pending[path] = order;}
            } catch { /* An encrypted or damaged old record must never open as a document. */ }
            app.files.splice(app.files.indexOf(file), 1);
            for (const map of [app.unsavedChanges, app.pendingServerSync, app.lastSyncedContent]) if (map) delete map[file.id];
            if (app.currentFileId === file.id) app.currentFileId = null;
            localStorage.removeItem('epm-file:' + file.id);
            persist();
        }
        apply();
    }
    async function request(method: string, body?: Orders) {
        const user = app.currentUser;
        const base = app.getApiBaseUrl?.() || 'api';
        const response = await fetch(base + '/files/orders?username=' + encodeURIComponent(user.username), {
            method, headers: {Authorization: 'Bearer ' + user.token, 'Content-Type': 'application/json'},
            ...(body ? {body: JSON.stringify({username:user.username, orders:body})} : {})
        });
        const result = app.parseJsonResponse ? await app.parseJsonResponse(response) : await response.json();
        if (result.code !== 200) throw new Error(result.message || '排序元数据同步失败');
        return result.data;
    }
    async function flush() {
        if (sending || !account || !loaded || navigator.onLine === false || !Object.keys(pending).length) return sending;
        const owner = account, session = app.currentUser?.token;
        const task = (async () => {
            try {
                while (owner === username() && session === app.currentUser?.token && Object.keys(pending).length) {
                    const batch = {...pending};await request('POST', batch);
                    if (account !== owner || username() !== owner || session !== app.currentUser?.token) return;
                    for (const [path, order] of Object.entries(batch)) if (pending[path] === order) delete pending[path];
                    persist();
                }
            } catch (error) { console.warn('排序已保存在本机，稍后重试同步', error); }
        })();
        sending = task;
        try { await task; } finally { if (sending === task) sending = undefined; }
    }
    async function load() {
        initialize();
        if (!account || navigator.onLine === false) return;
        if (loaded) {void flush();return;}
        if (loading) return loading;
        const owner = account, session = app.currentUser?.token;
        const task = (async () => {
            try {
                const remote = normalizeOrders(await request('GET'));
                if (username() !== owner || account !== owner || session !== app.currentUser?.token) return;
                // Pending local moves win over a metadata response started before those moves.
                orders = normalizeOrders({...orders, ...remote, ...pending});loaded = true;persist();apply();changed();
                void flush();
            } catch (error) { console.warn('排序元数据暂不可用，保留本机排序', error); }
        })();
        loading = task;
        try {await task;} finally {if (loading === task) loading = undefined;}
    }
    function save(value: Orders) {
        initialize();const update = normalizeOrders(value);Object.assign(orders, update);Object.assign(pending, update);
        persist();apply();void load();
    }
    const online = () => {loaded = false;void load();};
    window.addEventListener('online', online);
    return {load, save, refresh: () => {loaded = false;return load();}, destroy: () => window.removeEventListener('online', online)};
}
