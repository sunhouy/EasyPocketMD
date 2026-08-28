import * as XLSX from 'xlsx';

describe('Excel compatibility', () => {
    it('writes and reads workbooks through the xlsx-compatible API', () => {
        const rows = [
            ['Name', 'Score'],
            ['Ada', 10],
            ['Linus', 9]
        ];
        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        const workbook = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');

        const file = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const parsed = XLSX.read(file, { type: 'buffer' });
        const parsedRows = XLSX.utils.sheet_to_json(parsed.Sheets.Results, {
            header: 1,
            raw: true
        });

        expect(parsed.SheetNames).toEqual(['Results']);
        expect(parsedRows).toEqual(rows);
    });
});
