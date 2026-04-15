function decodeSAF(url) {
    if (url.startsWith('content://com.android.externalstorage.documents/document/primary%3A')) {
        let relPath = decodeURIComponent(url.substring(url.indexOf('%3A') + 3));
        return '/storage/emulated/0/' + relPath;
    }
    return url;
}
console.log(decodeSAF("content://com.android.externalstorage.documents/document/primary%3ATest.md"));
