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

    function getDialogOpenApi() {
        if (!global.__TAURI__) return null;
        if (global.__TAURI__.dialog && typeof global.__TAURI__.dialog.open === 'function') {
            return global.__TAURI__.dialog.open;
        }
        if (global.__TAURI__.core && global.__TAURI__.core.dialog && typeof global.__TAURI__.core.dialog.open === 'function') {
            return global.__TAURI__.core.dialog.open;
        }
        return null;
    }

    function getFsApi() {
        if (!global.__TAURI__) return null;
        if (global.__TAURI__.fs) {
            return global.__TAURI__.fs;
        }
        if (global.__TAURI__.core && global.__TAURI__.core.fs) {
            return global.__TAURI__.core.fs;
        }
        return null;
    }

    function buildFileResponse(path, content) {
        return {
            canceled: false,
            success: true,
            path: String(path),
            name: String(path).split(/[\\/]/).pop() || null,
            content: content,
            error: null,
            localFileMode: 'tauri'
        };
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
            var openDialog = getDialogOpenApi();
            var fs = getFsApi();
            if (!openDialog) {
                return invokeCommand('open_local_file_dialog');
            }

            return openDialog({
                multiple: false,
                filters: [
                    { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }
                ]
            }).then(function(selectedPath) {
                if (!selectedPath || (Array.isArray(selectedPath) && selectedPath.length === 0)) {
                    return {
                        canceled: true,
                        success: null,
                        path: null,
                        name: null,
                        content: null,
                        error: null,
                        localFileMode: null
                    };
                }

                var path = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;
                if (fs && typeof fs.readTextFile === 'function') {
                    return fs.readTextFile(String(path)).then(function(content) {
                        return buildFileResponse(path, content);
                    }).catch(function(error) {
                        return {
                            canceled: false,
                            success: false,
                            path: String(path),
                            name: null,
                            content: null,
                            error: error && error.message ? error.message : String(error),
                            localFileMode: null
                        };
                    });
                }

                return invokeCommand('read_local_file', { filePath: String(path) })
                    .then(function(result) {
                        if (result && typeof result === 'object') {
                            result.canceled = false;
                            if (!result.path) {
                                result.path = String(path);
                            }
                            return result;
                        }
                        return {
                            canceled: false,
                            success: false,
                            path: String(path),
                            name: null,
                            content: null,
                            error: 'Invalid local file read response',
                            localFileMode: null
                        };
                    })
                    .catch(function(error) {
                        return {
                            canceled: false,
                            success: false,
                            path: String(path),
                            name: null,
                            content: null,
                            error: error && error.message ? error.message : String(error),
                            localFileMode: null
                        };
                    });
            });
        },
        readLocalFile: function(filePath) {
            var fs = getFsApi();
            if (fs && typeof fs.readTextFile === 'function') {
                return fs.readTextFile(String(filePath)).then(function(content) {
                    return buildFileResponse(filePath, content);
                });
            }
            return invokeCommand('read_local_file', { filePath: filePath });
        },
        writeLocalFile: function(filePath, content) {
            var fs = getFsApi();
            if (fs && typeof fs.writeTextFile === 'function') {
                return fs.writeTextFile(String(filePath), String(content)).then(function() {
                    return {
                        success: true,
                        path: String(filePath),
                        error: null
                    };
                });
            }
            return invokeCommand('write_local_file', { filePath: filePath, content: content });
        },
        getMdAssociationEnabled: function() {
            return invokeCommand('get_md_association_enabled');
        },
        setMdAssociationEnabled: function(enabled) {
            return invokeCommand('set_md_association_enabled', { enabled: !!enabled });
        },
        consumePendingOpenFilePath: function() {
            return invokeCommand('consume_pending_open_file_path');
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
