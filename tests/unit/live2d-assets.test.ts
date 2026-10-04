/** @jest-environment jsdom */
// @ts-nocheck
import { LIVE2D_CACHE, prepareCachedModel } from '../../js/ui/live2d-assets';
const response = value => ({ ok: true, clone() { return this; }, json: async () => JSON.parse(JSON.stringify(value)), blob: async () => new Blob([JSON.stringify(value)]) });
beforeEach(() => {
    let next = 0;
    URL.createObjectURL = jest.fn(() => 'blob:https://editor.test/' + (++next)); URL.revokeObjectURL = jest.fn();
    const data = new Map();
    window.caches = { open: jest.fn(async () => ({ match: async key => data.get(key), put: async (key, value) => { data.set(key, value); } })) };
    window.fetch = jest.fn(async url => response(url.endsWith('.model.json') ? { model: 'moc/model.moc', textures: ['texture.png'], motions: { idle: [{ file: 'idle.mtn', sound: 'audio.mp3' }] } } : {}));
});
it('caches selected model assets across mounts and supplies independently disposable blob URLs', async () => {
    const signal = new AbortController().signal;
    const first = await prepareCachedModel('shizuku', signal);
    expect(fetch).toHaveBeenCalledTimes(4); expect(caches.open).toHaveBeenCalledWith(LIVE2D_CACHE);
    expect(first.path).not.toContain('/');
    const model = JSON.parse(decodeURIComponent(first.path.slice(6)));
    expect(model.model).toMatch(/^blob:/); expect(model.motions.idle[0].sound).toBeUndefined();
    first.dispose(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
    const second = await prepareCachedModel('shizuku', signal);
    expect(fetch).toHaveBeenCalledTimes(4); second.dispose();
});
it('still loads when persistent caching is unavailable and never stores resources in localStorage', async () => {
    caches.open.mockRejectedValue(new Error('quota'));
    const write = jest.spyOn(Storage.prototype, 'setItem');
    const prepared = await prepareCachedModel('koharu', new AbortController().signal);
    expect(write).not.toHaveBeenCalled(); prepared.dispose();
});
it('cleans successful resources if another resource fails and stops before fetch when cancelled', async () => {
    fetch.mockImplementation(async url => url.endsWith('idle.mtn') ? { ok: false, status: 404 } : response(url.endsWith('.model.json') ? { model: 'model.moc', textures: ['texture.png'], motions: { idle: [{ file: 'idle.mtn' }] } } : {}));
    await expect(prepareCachedModel('shizuku', new AbortController().signal)).rejects.toThrow('404');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(URL.createObjectURL.mock.calls.length);
    const aborted = new AbortController(); aborted.abort(); const count = fetch.mock.calls.length;
    await expect(prepareCachedModel('shizuku', aborted.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(count);
});
