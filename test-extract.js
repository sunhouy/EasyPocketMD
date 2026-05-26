const fs = require('fs');
function extractTextFromBinary(bytes) {
    let decoder16 = new TextDecoder('utf-16le', { fatal: false });
    let text16 = decoder16.decode(bytes);
    // filter out garbage: keep chinese, ascii text, standard punctuation.
    // Replace non-printable characters with spaces, then collapse spaces.
    let cleaned = text16.replace(/[^\x20-\x7E\u00A0-\u00FF\u0100-\u017F\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF\n\r]/g, ' ');
    return cleaned.replace(/ +/g, ' ').trim();
}
console.log(extractTextFromBinary(new Uint8Array([0x61, 0x00, 0x62, 0x00, 0x63, 0x00, 0x2d, 0x4e, 0xfd, 0x56])));
