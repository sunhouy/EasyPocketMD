/** @jest-environment jsdom */
// @ts-nocheck
export {};
const { createSyncRuntimeApi } = require('../../js/files/sync/index');
let mockCallbacks: any;
jest.mock('../../js/files/websocket-sync', () => ({
    createWebSocketClient: jest.fn(callbacks => {
        mockCallbacks = callbacks;
        return { isConnected: () => true, send: jest.fn(), disconnect: jest.fn() };
    }),
    createSyncThrottle: send => ({ schedule: send, cancel: jest.fn() })
}));
jest.mock('../../js/e2e', () => ({ resolveFileContent: async value => value, encrypt: async value => value }));

describe('move waits for background saves', () => {
    let state: any;
    let api: any;
    beforeEach(() => {
        jest.useFakeTimers();
        state = {
            currentUser: { username: 'user' }, currentFileId: 'file',
            files: [{ id: 'file', name: 'a/note', type: 'file', content: 'text' }],
            lastSyncedContent: { file: 'text' }, unsavedChanges: {}, syncAllFiles: jest.fn()
        };
        api = createSyncRuntimeApi({
            globalRef: state, g: key => state[key], isExternalLocalFile: () => false,
            getCurrentEditorContent: () => 'text', markPendingServerSync: jest.fn(), tryHandleTokenExpired:async()=>false, isEn:()=>false
        });
        api.startAutoSync();
    });
    afterEach(() => { api.stopAutoSync(); jest.useRealTimers(); });

    it('waits for the realtime HTTP acknowledgement before allowing a move', async () => {
        let reply;
        global.fetch = jest.fn(() => new Promise(resolve => { reply = resolve; }));
        await api.scheduleWebSocketSync('file');
        let completed = false;
        const waiting = api.waitForFileSync().then(() => { completed = true; });
        for(let i=0;i<50&&!reply;i++) await Promise.resolve();
        expect(completed).toBe(false);
        reply({json:async()=>({code:200,data:{content:'text',content_version:1}})});
        await waiting;
        expect(completed).toBe(true);
    });
    it('rejects a failed realtime save and keeps the file pending', async () => {
        global.fetch = jest.fn(async()=>({json:async()=>({code:500,message:'failed'})}));
        await api.scheduleWebSocketSync('file');
        await expect(api.waitForFileSync()).rejects.toThrow('保存尚未确认');
        expect(state.files[0].isSynced).toBe(false);
        expect(state.unsavedChanges.file).toBe(true);
    });
});
