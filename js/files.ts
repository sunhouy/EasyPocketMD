/**
 * Legacy compatibility shell.
 * Runtime implementation moved to js/files/index.ts.
 */
(function(global) {
    'use strict';

    if (!global || global.__easypocketmdFilesCompatLoading) return;
    global.__easypocketmdFilesCompatLoading = true;

    Promise.resolve()
        .then(function() {
            return import('./files/index.ts');
        })
        .catch(function(error) {
            console.error('[files.js] Failed to load new files runtime:', error);
        })
        .finally(function() {
            global.__easypocketmdFilesCompatLoading = false;
        });
})(typeof window !== 'undefined' ? window : this);
