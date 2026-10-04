/** @jest-environment jsdom */
// @ts-nocheck
export {};
require('../../js/ui/upload');
const fs = jest.requireActual('fs');
const html = fs.readFileSync(require('path').resolve(__dirname, '../../index.html'), 'utf8');
beforeEach(() => {
    document.body.innerHTML = ''; window.userSettings = { storageLocation: 'local' }; window.tempStorageLocation = 'local';
    window.currentUser = { username: 'owner', token: 'token' }; window.getApiBaseUrl = () => '/api';
    window.ResourceLoader = { storeLocalFile: jest.fn(), getLocalBlobUrl: jest.fn() };
    window.E2EAttachments = { currentFileEncrypted: () => false };
    window.showUploadStatus = jest.fn(); window.vditor = { insertValue: jest.fn() };
    window.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ success: true, count: 1, urls: ['/uploads/picture.png'] }) }));
});
it('ignores retired local settings and uploads attachments to the cloud without asking for storage location', async () => {
    const file = new File(['bytes'], 'picture.png', { type: 'image/png' });
    const link = await window.uploadFiles([file], true);
    expect(fetch).toHaveBeenCalledWith('/api/external/upload', expect.objectContaining({ method: 'POST' }));
    expect(fetch.mock.calls[0][1].body.get('files[]').name).toBe('picture.png');
    expect(link).toContain('/uploads/picture.png'); expect(window.vditor.insertValue).toHaveBeenCalled();
    expect(window.ResourceLoader.storeLocalFile).not.toHaveBeenCalled(); expect(document.querySelector('.modal-overlay')).toBeNull();
    document.body.innerHTML = html;
    expect(document.querySelector('[name="storageLocation"]')).toBeNull();
});
it('keeps encrypted attachments on the encrypted cloud uploader', async () => {
    window.E2EAttachments = { currentFileEncrypted: () => true, uploadEncrypted: jest.fn(async () => '![secret](/uploads/secret.epmd#epmd-e2e)') };
    const file = new File(['private'], 'secret.png', { type: 'image/png' });
    await window.uploadFiles([file], false);
    expect(window.E2EAttachments.uploadEncrypted).toHaveBeenCalledWith([file]);
    expect(window.ResourceLoader.storeLocalFile).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
