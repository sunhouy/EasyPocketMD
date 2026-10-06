jest.unmock('fs');
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveFrontendAsset } from '../../api/utils/frontend-assets';
it('serves Docker frontend assets from dist with development fallback and controlled absence',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'epmd-assets-')),dist=path.join(root,'dist');fs.mkdirSync(dist);
    try {
        fs.writeFileSync(path.join(dist,'icon.png'),'image');fs.writeFileSync(path.join(dist,'manifest.webmanifest'),'{}');
        expect(resolveFrontendAsset('icon.png',root,dist)).toBe(path.join(dist,'icon.png'));
        expect(resolveFrontendAsset('manifest.webmanifest',root,dist)).toBe(path.join(dist,'manifest.webmanifest'));
        fs.writeFileSync(path.join(root,'icon.png'),'fallback');fs.unlinkSync(path.join(dist,'icon.png'));
        expect(resolveFrontendAsset('icon.png',root,dist)).toBe(path.join(root,'icon.png'));
        expect(resolveFrontendAsset('missing.png',root,dist)).toBeUndefined();
    }finally{fs.rmSync(root,{recursive:true,force:true});}
});
