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

    function getOpenerApi() {
        if (!global.__TAURI__) return null;
        if (global.__TAURI__.opener && typeof global.__TAURI__.opener.openUrl === 'function') {
            return global.__TAURI__.opener;
        }
        if (global.__TAURI__.core && global.__TAURI__.core.opener && typeof global.__TAURI__.core.opener.openUrl === 'function') {
            return global.__TAURI__.core.opener;
        }
        return null;
    }

    function shouldUseInvokeForPath(filePath) {
        var path = String(filePath || '');
        if (!path) return true;
        if (/^file:\/\//i.test(path)) return true;
        if (/^[a-zA-Z]:[\\/]/.test(path)) return true;
        if (/^\\\\\\?\\/.test(path)) return true;
        if (/^\\\\/.test(path)) return true;
        return false;
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
                    }).catch(function() {
                        return invokeCommand('read_local_file', { filePath: String(path) })
                            .then(function(result) {
                                if (result && result.success) {
                                    result.canceled = false;
                                    if (!result.path) result.path = String(path);
                                    return result;
                                }
                                return {
                                    canceled: false,
                                    success: false,
                                    path: String(path),
                                    name: null,
                                    content: null,
                                    error: (result && result.error) || 'Failed to read local file',
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
            if (shouldUseInvokeForPath(filePath)) {
                return invokeCommand('read_local_file', { filePath: filePath });
            }
            if (fs && typeof fs.readTextFile === 'function') {
                return fs.readTextFile(String(filePath)).then(function(content) {
                    return buildFileResponse(filePath, content);
                }).catch(function() {
                    return invokeCommand('read_local_file', { filePath: filePath });
                });
            }
            return invokeCommand('read_local_file', { filePath: filePath });
        },
        writeLocalFile: function(filePath, content) {
            var fs = getFsApi();
            if (shouldUseInvokeForPath(filePath)) {
                return invokeCommand('write_local_file', { filePath: filePath, content: content });
            }
            if (fs && typeof fs.writeTextFile === 'function') {
                return fs.writeTextFile(String(filePath), String(content)).then(function() {
                    return {
                        success: true,
                        path: String(filePath),
                        error: null
                    };
                }).catch(function() {
                    return invokeCommand('write_local_file', { filePath: filePath, content: content });
                });
            }
            return invokeCommand('write_local_file', { filePath: filePath, content: content });
        },
        openExternalUrl: function(url) {
            var target = String(url || '').trim();
            if (!target) {
                return Promise.reject(new Error('URL is required'));
            }

            return invokeCommand('open_external_url', { url: target }).catch(function() {
                var opener = getOpenerApi();
                if (opener && typeof opener.openUrl === 'function') {
                    return Promise.resolve(opener.openUrl(target)).catch(function() {
                        var opened = global.open(target, '_blank', 'noopener,noreferrer');
                        if (!opened) {
                            global.location.href = target;
                        }
                    });
                }

                var opened = global.open(target, '_blank', 'noopener,noreferrer');
                if (!opened) {
                    global.location.href = target;
                }
            });
        },
        syncAndroidSystemUi: function(isDarkMode) {
            try {
                var ua = (navigator.userAgent || '').toLowerCase();
                if (ua.indexOf('android') === -1) {
                    return Promise.resolve(false);
                }

                var tauriRoot = global.__TAURI__ || null;
                var windowApi = tauriRoot && (tauriRoot.window || (tauriRoot.core && tauriRoot.core.window));
                if (!windowApi || typeof windowApi.getCurrentWindow !== 'function') {
                    return Promise.resolve(false);
                }

                var currentWindow = windowApi.getCurrentWindow();
                if (!currentWindow) {
                    return Promise.resolve(false);
                }

                var statusBarColor = isDarkMode ? '#0f172a' : '#f3f4f6';

                return invokeCommand('set_android_system_ui', {
                    darkMode: !!isDarkMode,
                    statusBarColor: statusBarColor
                }).catch(function() {
                    var tasks = [];
                    if (typeof currentWindow.setFullscreen === 'function') {
                        tasks.push(Promise.resolve(currentWindow.setFullscreen(false)).catch(function() {}));
                    }
                    if (typeof currentWindow.setTheme === 'function') {
                        tasks.push(Promise.resolve(currentWindow.setTheme(isDarkMode ? 'dark' : 'light')).catch(function() {}));
                    }

                    return Promise.all(tasks).then(function() {
                        return true;
                    });
                });
            } catch (error) {
                return Promise.resolve(false);
            }
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

    // Android webview may re-enter immersive state during lifecycle transitions.
    // Keep forcing non-fullscreen state so status bar stays visible.
    try {
        var isAndroid = (global.navigator && /android/i.test(global.navigator.userAgent || ''));
        if (isAndroid && global.electron && typeof global.electron.syncAndroidSystemUi === 'function') {
            var applyUi = function() {
                var nightMode = !!(global.nightMode === true || (global.document && global.document.body && global.document.body.classList.contains('night-mode')));
                global.electron.syncAndroidSystemUi(nightMode).catch(function() {});
            };

            applyUi();
            if (global.document) {
                global.document.addEventListener('visibilitychange', applyUi, false);
            }
            global.addEventListener('focus', applyUi, false);
            global.addEventListener('pageshow', applyUi, false);
            setTimeout(applyUi, 500);
            setTimeout(applyUi, 1800);
        }
    } catch (error) {
        // no-op
    }
})(typeof window !== 'undefined' ? window : this);
