function extractTextFromBinaryAdvanced(bytes) {
    if (!bytes || bytes.length === 0) return '';
    
    const filterRegex = /[^\x20-\x7E\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF\n\r]/g;
    
    // 1. Try UTF-16LE
    const decoder16 = new TextDecoder('utf-16le', { fatal: false });
    const text16 = decoder16.decode(bytes);
    const chunks16 = text16.replace(filterRegex, '\0').split(/\0+/).filter(c => c.trim().length >= 2);
    
    // 2. Try GBK (which also covers ASCII)
    const decoderGBK = new TextDecoder('gbk', { fatal: false });
    const textGBK = decoderGBK.decode(bytes);
    const chunksGBK = textGBK.replace(filterRegex, '\0').split(/\0+/).filter(c => c.trim().length >= 2);
    
    // Which one has more valid characters? Or we can just combine them or use heuristics.
    // For DOC/PPT, the English is often UTF-16LE or ASCII. Chinese is usually UTF-16LE in newer docs,
    // or GBK in older docs. Note: UTF-16LE decoding of GBK data produces garbage which is usually filtered out.
    // Let's count valid Chinese characters + English words.
    function score(chunks) {
        const text = chunks.join('');
        const cjkMatch = text.match(/[\u4E00-\u9FFF]/g);
        const cjkCount = cjkMatch ? cjkMatch.length : 0;
        const asciiCount = text.length - cjkCount;
        // Chinese characters are highly indicative of correct decoding
        return cjkCount * 10 + asciiCount;
    }
    
    const score16 = score(chunks16);
    const scoreGBK = score(chunksGBK);
    
    if (score16 > scoreGBK) {
        return chunks16.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    } else {
        return chunksGBK.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
}

// "abc 中国" in GBK: a b c d6 d0 b9 fa
console.log(extractTextFromBinaryAdvanced(new Uint8Array([0x61, 0x62, 0x63, 0x20, 0xd6, 0xd0, 0xb9, 0xfa])));
