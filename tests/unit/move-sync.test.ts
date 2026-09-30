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
jest.mock('../../js/e2e', () => ({ encryptSync: value => value }));

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
            getCurrentEditorContent: () => 'text', markPendingServerSync: jest.fn()
        });
        api.startAutoSync();
    });
    afterEach(() => { api.stopAutoSync(); jest.useRealTimers(); });

    it('waits for websocket acknowledgement before allowing a move', async () => {
        await api.scheduleWebSocketSync('file');
        let completed = false;
        const waiting = api.waitForFileSync().then(() => { completed = true; });
        await Promise.resolve();
        expect(completed).toBe(false);
        mockCallbacks.onFileSaved({ filename: 'a/note', content: 'text', code: 200 });
        await waiting;
        expect(completed).toBe(true);
    });

    it('does not move files whose websocket save has timed out', async () => {
        await api.scheduleWebSocketSync('file');
        const failed = expect(api.waitForFileSync()).rejects.toThrow('保存尚未确认');
        jest.advanceTimersByTime(15000);
        await failed;
    });

    it('rejects a failed save and keeps the file pending', async () => {
        await api.scheduleWebSocketSync('file');
        const failed = expect(api.waitForFileSync()).rejects.toThrow('failed');
        mockCallbacks.onFileSaved({ filename: 'a/note', code: 500, message: 'failed' });
        await failed;
        expect(state.files[0].isSynced).toBe(false);
        expect(state.unsavedChanges.file).toBe(true);
    });
});
