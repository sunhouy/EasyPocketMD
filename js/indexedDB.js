
(function(global) {
    'use strict';

    const DB_NAME = 'MarkdownEditorFiles';
    const DB_VERSION = 1;
    const STORE_NAME = 'files';

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
        createBlobURL,
        revokeBlobURL
    };

})(typeof window !== 'undefined' ? window : this);
