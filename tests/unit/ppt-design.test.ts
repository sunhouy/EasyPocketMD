import PptxGenJS from 'pptxgenjs';
import { paginateSlideSpec, renderSlideFromSpec, SlideSpec } from '../../api/services/ppt-design';
import { execFileSync } from 'node:child_process';
const base: SlideSpec = { layout: 'content', role: 'body', themeToken: 'white-black',
    title: '明确结论', subtitle: '', bullets: [], sections: [], stats: [], highlights: [], quote: null, image: null, continuation: false };

describe('Editable PPT layout', () => {
    test.each(['16:9', '4:3'])('preserves long section content within slide bounds (%s)', ratio => {
        const items = Array.from({ length: 6 }, (_, i) => `${i}：` + '这是需要完整显示的详细论据与数据说明。'.repeat(3));
        const spec = { ...base, layout: 'timeline', sections: [{ title: '研究过程', items }] };
        const pages = paginateSlideSpec(spec, ratio);
        const texts: string[] = [];
        const height = ratio === '16:9' ? 5.625 : 7.5;
        for (const page of pages) {
            const slide = { addText: jest.fn((text, options) => {
                texts.push(text);
                expect(options.y + options.h).toBeLessThanOrEqual(height);
                expect(options.x + options.w).toBeLessThanOrEqual(10);
            }), addShape: jest.fn() };
            renderSlideFromSpec(slide as unknown as PptxGenJS.Slide, page, ratio, '1');
        }
        items.forEach(item => expect(texts).toContain(item));
        expect(pages.length).toBeGreaterThanOrEqual(1);
    });
    test('closing slide has one title and no fabricated source text', () => {
        const slide = { addText: jest.fn(), addShape: jest.fn() };
        renderSlideFromSpec(slide as unknown as PptxGenJS.Slide, { ...base, layout: 'thanks', title: '谢谢' }, '16:9', '1');
        expect(slide.addText.mock.calls.filter(call => call[0] === '谢谢')).toHaveLength(1);
        slide.addText.mockClear();
        renderSlideFromSpec(slide as unknown as PptxGenJS.Slide, { ...base, layout: 'references' }, '16:9', '2');
        expect(slide.addText.mock.calls.map(call => call[0]).join('')).not.toContain('相关研究文献');
    });
    test('writes native editable text into an actual PPTX archive', () => {
        // PptxGenJS loads Node dependencies through dynamic import, so execute in
        // Node rather than Jest's VM (which does not enable ESM imports).
        const xml = execFileSync(process.execPath, ['-e', `
            const fs = require('fs'), ts = require('typescript'), Module = require('module');
            const file = require('path').resolve('api/services/ppt-design.ts');
            const mod = new Module(file, module); mod.filename = file;
            mod.paths = Module._nodeModulePaths(require('path').dirname(file));
            mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
                compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
            }).outputText, file);
            const Pptx = require('pptxgenjs'), ppt = new Pptx();
            ppt.defineLayout({name:'wide',width:10,height:5.625}); ppt.layout='wide';
            mod.exports.renderSlideFromSpec(ppt.addSlide(), ${JSON.stringify({ ...base, bullets: [{ text: '可编辑的结论', subBullets: ['真实数据支持结论'] }] })}, '16:9', '1');
            ppt.write({outputType:'nodebuffer'}).then(buffer => require('jszip').loadAsync(buffer))
                .then(zip => zip.file('ppt/slides/slide1.xml').async('string'))
                .then(xml => process.stdout.write(xml)).catch(e => {console.error(e);process.exit(1)});
        `], { encoding: 'utf8' });
        expect(xml).toContain('可编辑的结论');
        expect(xml).toContain('<a:t>');
        expect(xml).not.toContain('<p:pic>');
    });
});
