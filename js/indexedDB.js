
(function(global) {
    'use strict';

    const DB_NAME = 'MarkdownEditorFiles';
    const DB_VERSION = 2;
    const STORE_NAME = 'files';
    const DRAFT_STORE_NAME = 'drafts';

    let db = null;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    const store = database.createObjectStore(STORE_NAME, { keyPath: 'url' });
                    store.createIndex('url', 'url', { unique: true });
                    store.createIndex('lastModified', 'lastModified', { unique: false });
                    store.createIndex('etag', 'etag', { unique: false });
                    store.createIndex('contentType', 'contentType', { unique: false });
                }

                if (!database.objectStoreNames.contains(DRAFT_STORE_NAME)) {
                    const draftStore = database.createObjectStore(DRAFT_STORE_NAME, { keyPath: 'fileId' });
                    draftStore.createIndex('fileId', 'fileId', { unique: true });
                    draftStore.createIndex('timestamp', 'timestamp', { unique: false });
                    draftStore.createIndex('sessionId', 'sessionId', { unique: false });
                }
            };
        });
    }

    async function initDB() {
        if (db) return db;
        return await openDB();
    }

    async function saveFile(url, data, contentType, lastModified = null, etag = null) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            const fileData = {
                url: url,
                data: data,
                contentType: contentType,
                lastModified: lastModified || Date.now(),
                etag: etag,
                createdAt: Date.now()
            };
            
            const request = store.put(fileData);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function getFile(url) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(url);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteFile(url) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(url);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function clearAll() {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function getAllFiles() {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveDraft(draft) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([DRAFT_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(DRAFT_STORE_NAME);
            const draftData = {
                fileId: String(draft && draft.fileId ? draft.fileId : ''),
                fileName: String(draft && draft.fileName ? draft.fileName : ''),
                content: String(draft && draft.content ? draft.content : ''),
                timestamp: Number(draft && draft.timestamp) || Date.now(),
                lastModified: Number(draft && draft.lastModified) || Date.now(),
                sessionId: String(draft && draft.sessionId ? draft.sessionId : ''),
                contentVersion: Number(draft && draft.contentVersion) || 0,
                contentHash: String(draft && draft.contentHash ? draft.contentHash : '')
            };

            const request = store.put(draftData);
            request.onsuccess = () => resolve(draftData);
            request.onerror = () => reject(request.error);
        });
    }

    async function getDraft(fileId) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([DRAFT_STORE_NAME], 'readonly');
            const store = transaction.objectStore(DRAFT_STORE_NAME);
            const request = store.get(String(fileId));

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteDraft(fileId) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([DRAFT_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(DRAFT_STORE_NAME);
            const request = store.delete(String(fileId));

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function getAllDrafts() {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([DRAFT_STORE_NAME], 'readonly');
            const store = transaction.objectStore(DRAFT_STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async function clearDrafts() {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([DRAFT_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(DRAFT_STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    function createBlobURL(data, contentType) {
        const blob = new Blob([data], { type: contentType });
        return URL.createObjectURL(blob);
    }

    function revokeBlobURL(url) {
        URL.revokeObjectURL(url);
    }

    global.IndexedDBManager = {
        initDB,
        saveFile,
        getFile,
        deleteFile,
        clearAll,
        getAllFiles,
        saveDraft,
        getDraft,
        deleteDraft,
        getAllDrafts,
        clearDrafts,
        createBlobURL,
        revokeBlobURL
    };

})(typeof window !== 'undefined' ? window : this);
