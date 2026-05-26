const fs = require('fs');
let code = fs.readFileSync('js/tauri-bridge.js', 'utf8');

const resolver = `    function resolveAndroidURI(uri) {
        if (typeof uri !== 'string') return uri;
        if (uri.startsWith('content://com.android.externalstorage.documents/document/')) {
            var docId = uri.substring('content://com.android.externalstorage.documents/document/'.length);
            docId = decodeURIComponent(docId);
            var colonIdx = docId.indexOf(':');
            if (colonIdx !== -1) {
                var volumeId = docId.substring(0, colonIdx);
                var path = docId.substring(colonIdx + 1);
                if (volumeId === 'primary') {
                    return '/storage/emulated/0/' + path;
                } else {
                    return '/storage/' + volumeId + '/' + path;
                }
            }
        }
        // Fallback for url-encoded file:// paths or other schemes if needed
        return uri;
    }

    function shouldUseInvokeForPath`;

code = code.replace('    function shouldUseInvokeForPath', resolver);

const openLocalFileDialogRe = /var path = Array\.isArray\(selectedPath\) \? selectedPath\[0\] \: selectedPath;/;
code = code.replace(openLocalFileDialogRe, `var path = resolveAndroidURI(Array.isArray(selectedPath) ? selectedPath[0] : selectedPath);`);

const readLocalFileRe = /readLocalFile:\ function\(filePath\) \{/;
code = code.replace(readLocalFileRe, `readLocalFile: function(filePath) {
            filePath = resolveAndroidURI(filePath);`);

const writeLocalFileRe = /writeLocalFile:\ function\(filePath,\ content\) \{/;
code = code.replace(writeLocalFileRe, `writeLocalFile: function(filePath, content) {
            filePath = resolveAndroidURI(filePath);`);

const getLocalFileRe = /getLocalFilePath:\ function\(name\) \{/;
code = code.replace(getLocalFileRe, `getLocalFilePath: function(name) {
            name = resolveAndroidURI(name);`);

fs.writeFileSync('js/tauri-bridge.js', code);
