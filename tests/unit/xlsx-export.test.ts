import * as XLSX from 'xlsx';
import { createMarkdownXLSX, markdownWorkbook } from '../../js/ui/xlsx-export';

describe('Markdown XLSX export', () => {
    it('creates table sheets with readable cells, unique names and full document text', () => {
        const source = '# 报告\n\n说明文字\n\n| 姓名 | 值 |\n| --- | --- |\n| **甲** | 00123 |\n| 乙 | =SUM(A1) |\n\n# 报告\n\n| A | B |\n| - | - |\n| x\\|y | `代码` |';
        const workbook = XLSX.read(createMarkdownXLSX(source), { type: 'array' });
        expect(workbook.SheetNames).toEqual(['文档', '报告', '报告 (2)']);
        expect(XLSX.utils.sheet_to_json(workbook.Sheets['报告'], { header: 1 })).toEqual([
            ['姓名', '值'], ['甲', '00123'], ['乙', '=SUM(A1)']
        ]);
        expect(workbook.Sheets['报告'].B3.f).toBeUndefined();
        expect(workbook.Sheets['报告'].B3.t).toBe('s');
        expect(XLSX.utils.sheet_to_json(workbook.Sheets['报告 (2)'], { header: 1 })).toContainEqual(['x|y', '代码']);
        expect(XLSX.utils.sheet_to_json(workbook.Sheets['文档'], { header: 1 })).toContainEqual(['3', '说明文字']);
    });
    it('exports documents without tables and preserves long lines without Excel truncation', () => {
        const text = '文'.repeat(40000);
        const workbook = markdownWorkbook(text, true);
        expect(workbook.SheetNames).toEqual(['Document']);
        const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Document, { header: 1 });
        expect(rows.slice(1).map(row => row[1]).join('')).toBe(text);
    });
});
