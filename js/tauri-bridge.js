(function(global) {
    'use strict';

    function getInvoke() {
        if (!global.__TAURI__) return null;
        if (typeof global.__TAURI__.invoke === 'function') {
            return global.__TAURI__.invoke;
        }
        if (global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
            return global.__TAURI__.core.invoke;
        }
        return null;
    }

    function getEventApi() {
        if (!global.__TAURI__) return null;
        if (global.__TAURI__.event && typeof global.__TAURI__.event.listen === 'function') {
            return global.__TAURI__.event;
        }
        if (global.__TAURI__.core && global.__TAURI__.core.event && typeof global.__TAURI__.core.event.listen === 'function') {
            return global.__TAURI__.core.event;
        }
        return null;
    }

    function bindEvent(channel, callback) {
        if (typeof callback !== 'function') return function() {};

        var eventApi = getEventApi();
        if (!eventApi || typeof eventApi.listen !== 'function') {
            return function() {};
        }

        var disposed = false;
        var cleanup = null;

        eventApi.listen(channel, function(event) {
            if (disposed) return;
            if (event && Object.prototype.hasOwnProperty.call(event, 'payload')) {
                callback(event.payload);
                return;
            }
            callback(event);
        }).then(function(unlisten) {
            cleanup = typeof unlisten === 'function' ? unlisten : null;
            if (disposed && cleanup) {
                try {
                    cleanup();
                } catch (error) {
                    console.warn('[tauri-bridge] Failed to cleanup listener:', error);
                }
            }
        }).catch(function(error) {
            console.warn('[tauri-bridge] Failed to bind event listener:', error);
        });

        return function() {
            disposed = true;
            if (cleanup) {
                try {
                    cleanup();
                } catch (error) {
                    console.warn('[tauri-bridge] Failed to unbind event listener:', error);
                }
            }
        };
    }

    function invokeCommand(command, payload) {
        var invoke = getInvoke();
        if (!invoke) {
            return Promise.reject(new Error('Tauri runtime is unavailable'));
        }
        return invoke(command, payload || {});
    }

    if (!getInvoke()) return;

    global.electron = {
        isElectron: true,
        isTauri: true,
        saveLocalFile: function(name, content) {
            return invokeCommand('save_local_file', { name: name, content: content });
        },
        getLocalFilePath: function(name) {
            return invokeCommand('get_local_file_path', { name: name });
        },
        openLocalFileDialog: function() {
            return invokeCommand('open_local_file_dialog');
        },
        readLocalFile: function(filePath) {
            return invokeCommand('read_local_file', { filePath: filePath });
        },
        writeLocalFile: function(filePath, content) {
            return invokeCommand('write_local_file', { filePath: filePath, content: content });
        },
        getMdAssociationEnabled: function() {
            return invokeCommand('get_md_association_enabled');
        },
        setMdAssociationEnabled: function(enabled) {
            return invokeCommand('set_md_association_enabled', { enabled: !!enabled });
        },
        onOpenLocalFileRequest: function(callback) {
            return bindEvent('open-local-file-request', callback);
        },
        ipcRenderer: {
            on: function(channel, callback) {
                return bindEvent(channel, callback);
            },
            removeAllListeners: function() {
                // no-op for Tauri bridge
            }
        }
    };

    global.desktopRuntime = {
        type: 'tauri'
    };
})(typeof window !== 'undefined' ? window : this);
