function resolveAndroidURI(uri) {
    if (typeof uri !== 'string') return uri;
    if (uri.startsWith('content://com.android.externalstorage.documents/document/')) {
        let docId = uri.substring('content://com.android.externalstorage.documents/document/'.length);
        docId = decodeURIComponent(docId);
        let colonIdx = docId.indexOf(':');
        if (colonIdx !== -1) {
            let volumeId = docId.substring(0, colonIdx);
            let path = docId.substring(colonIdx + 1);
            if (volumeId === 'primary') {
                return '/storage/emulated/0/' + path;
            } else {
                return '/storage/' + volumeId + '/' + path;
            }
        }
    }
    return uri;
}
console.log(resolveAndroidURI("content://com.android.externalstorage.documents/document/primary%3ADownload%2FTest.md"));
console.log(resolveAndroidURI("content://com.android.externalstorage.documents/document/1234-ABCD%3ADownload%2FTest.md"));
