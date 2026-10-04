import MarkdownIt from 'markdown-it';
import * as XLSX from 'xlsx';

/** Preserve text as text (including formula-looking strings and leading zeros). */
export function markdownWorkbook(content: string, en = false): XLSX.WorkBook {
    const workbook = XLSX.utils.book_new();
    const names = new Set<string>();
    const sheetName = (name: string) => {
        const clean = name.replace(/[\\/?*\[\]:]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Sheet';
        let result = clean, suffix = 2;
        while (names.has(result.toLowerCase())) { const tail = ' (' + suffix++ + ')'; result = clean.slice(0, 31 - tail.length) + tail; }
        names.add(result.toLowerCase()); return result;
    };
    function append(rows: string[][], name: string, table = false) {
        if (rows.length > 1048576) throw new Error(en ? 'Too many Excel rows' : '超出 Excel 行数限制');
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        const columns = rows.reduce((max, row) => Math.max(max, row.length), 1);
        sheet['!cols'] = Array.from({ length: columns }, (_, index) => ({ wch: Math.min(60, Math.max(12,
            ...rows.slice(0, 100).map(row => Array.from(row[index] || '').length + 2))) }));
        if (table && sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] };
        XLSX.utils.book_append_sheet(workbook, sheet, sheetName(name));
    }
    const documentRows = [[en ? 'Line' : '行号', en ? 'Document content' : '文档内容']];
    content.split(/\r?\n/).forEach((line, index) => {
        // Excel cells are limited to 32767 characters: split without dropping text.
        for (let offset = 0; offset < Math.max(1, line.length); offset += 32000)
            documentRows.push([String(index + 1), line.slice(offset, offset + 32000)]);
    });
    append(documentRows, en ? 'Document' : '文档');
    const tokens = new MarkdownIt({ html: false }).parse(content, {});
    let heading = '', number = 0;
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === 'heading_open') heading = tokens[i + 1]?.content || '';
        if (tokens[i].type !== 'table_open') continue;
        const rows: string[][] = []; let row: string[] = [];
        for (++i; i < tokens.length && tokens[i].type !== 'table_close'; i++) {
            if (tokens[i].type === 'tr_open') row = [];
            if (tokens[i].type === 'inline') {
                const text = tokens[i].children?.map(child => child.type === 'softbreak' || child.type === 'hardbreak' ? '\n'
                    : child.type === 'text' || child.type === 'code_inline' || child.type === 'image' ? child.content : '').join('') || tokens[i].content;
                if (text.length > 32767) throw new Error(en ? 'Table cell exceeds Excel text limit' : '表格单元格超过 Excel 文字长度限制');
                row.push(text);
            }
            if (tokens[i].type === 'tr_close') rows.push(row);
        }
        number++; append(rows, heading || (en ? 'Table ' : '表格 ') + number, true);
    }
    return workbook;
}
export function createMarkdownXLSX(content: string, en = false): Uint8Array {
    return new Uint8Array(XLSX.write(markdownWorkbook(content, en), { bookType: 'xlsx', type: 'array', compression: true }));
}
