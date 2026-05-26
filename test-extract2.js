function extractTextFromBinaryAdvanced(bytes) {
    if (!bytes || bytes.length === 0) return '';
    
    // Try to decode the entire buffer as UTF-16LE, which handles Chinese well in Office formats.
    const decoder16 = new TextDecoder('utf-16le', { fatal: false });
    const text16 = decoder16.decode(bytes);
    
    // Also try UTF-8 decoding for older ANSI/ASCII parts that might not be 16-bit aligned
    const decoder8 = new TextDecoder('utf-8', { fatal: false });
    const text8 = decoder8.decode(bytes);

    // Keep ASCII printable, Chinese characters, standard punctuation, and newlines
    // \x20-\x7E: Printable ASCII
    // \u4E00-\u9FFF: CJK Unified Ideographs
    // \u3000-\u303F: CJK Symbols and Punctuation
    // \uFF00-\uFFEF: Halfwidth and Fullwidth Forms
    // \n\r: Newlines
    const filterRegex = /[^\x20-\x7E\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF\n\r]/g;
    
    // Replace invalid characters with nulls temporarily so we can split chunks
    const cleaned16Chunks = text16.replace(filterRegex, '\0').split(/\0+/).filter(c => c.length >= 2);
    // For 8-bit text, many Chinese encodings like GBK will be mangled by UTF-8 decoder.
    // Instead of complex GBK detection, we'll try to extract any ASCII >= 4 characters from the raw bytes.
    let asciiChunks = [];
    let i = 0;
    while(i < bytes.length) {
        if (bytes[i] >= 32 && bytes[i] < 127) {
            let start = i;
            while(i < bytes.length && bytes[i] >= 32 && bytes[i] < 127) {
                i++;
            }
            if (i - start >= 4) {
                let str = '';
                for(let j=start; j<i; j++) str += String.fromCharCode(bytes[j]);
                asciiChunks.push(str);
            }
        } else {
            i++;
        }
    }

    // Merge and deduplicate by finding the richest text
    // Actually, Office formats usually put the majority of text in UTF-16.
    // Let's just combine the 16-bit chunks that have Chinese, and any ASCII chunks.
    let finalChunks = [];
    
    // Collect all valid UTF-16 chunks first
    cleaned16Chunks.forEach(chunk => {
        if (chunk.trim()) {
            finalChunks.push(chunk.trim());
        }
    });
    
    return finalChunks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

console.log(extractTextFromBinaryAdvanced(new Uint8Array([0x61, 0x00, 0x62, 0x00, 0x63, 0x00, 0x2d, 0x4e, 0xfd, 0x56])));
