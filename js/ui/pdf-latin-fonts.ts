import serifRegular from '../../assets/fonts/liberation/LiberationSerif-Regular.ttf?url';
import serifBold from '../../assets/fonts/liberation/LiberationSerif-Bold.ttf?url';
import serifItalic from '../../assets/fonts/liberation/LiberationSerif-Italic.ttf?url';
import serifBoldItalic from '../../assets/fonts/liberation/LiberationSerif-BoldItalic.ttf?url';
import sansRegular from '../../assets/fonts/liberation/LiberationSans-Regular.ttf?url';
import sansBold from '../../assets/fonts/liberation/LiberationSans-Bold.ttf?url';
import sansItalic from '../../assets/fonts/liberation/LiberationSans-Italic.ttf?url';
import sansBoldItalic from '../../assets/fonts/liberation/LiberationSans-BoldItalic.ttf?url';
interface PdfFonts { vfs: Record<string, string>; fonts: Record<string, Record<string, string>> }
/** Lazy bundled, OFL-licensed substitutes for Times New Roman and Arial. */
export async function loadLatinPdfFont(pdf: PdfFonts, englishFont: unknown): Promise<string> {
    const sans = englishFont === 'Arial'; const family = sans ? 'LiberationSans' : 'LiberationSerif';
    if (pdf.fonts[family]) return family;
    const urls = sans ? [sansRegular, sansBold, sansItalic, sansBoldItalic] : [serifRegular, serifBold, serifItalic, serifBoldItalic];
    const names = ['normal', 'bold', 'italics', 'bolditalics'];
    const buffers = await Promise.all(urls.map(async url => {
        const response = await fetch(url); if (!response.ok) throw new Error('Unable to load bundled PDF font');
        const bytes = new Uint8Array(await response.arrayBuffer()); let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(binary);
    }));
    const font: Record<string, string> = {};
    buffers.forEach((buffer, i) => { const name = family + '-' + names[i] + '.ttf'; pdf.vfs[name] = buffer; font[names[i]] = name; });
    pdf.fonts[family] = font; return family;
}
