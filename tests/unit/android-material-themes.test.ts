/** @jest-environment jsdom */
const fs:typeof import('node:fs')=jest.requireActual('node:fs');
import path from 'node:path';
const root=path.resolve(__dirname,'../..');
const xml=new DOMParser().parseFromString(fs.readFileSync(path.join(root,'src-tauri/platform/android/res/values/epmd-native.xml'),'utf8'),'application/xml');
const keep=fs.readFileSync(path.join(root,'src-tauri/platform/android/res/raw/epmd_keep.xml'),'utf8');
function luminance(hex:string){const rgb=hex.slice(1).match(/../g)!.map(value=>{const n=parseInt(value,16)/255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
it('loads native themes from the real resource file',()=>expect(xml.querySelectorAll('style').length).toBeGreaterThan(0));
for(const style of [...xml.querySelectorAll('style')]) {
 const name=style.getAttribute('name')!;
 it(name+' retains readable surface text and survives Android resource shrinking',()=>{
  const properties=Object.fromEntries([...style.querySelectorAll('item')].map(item=>[item.getAttribute('name'),item.textContent!.trim()]));
  const bg=luminance(properties.colorSurface),fg=luminance(properties.colorOnSurface);
  expect((Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)).toBeGreaterThanOrEqual(4.5);
  if(properties['android:textColorPrimary']){const text=luminance(properties['android:textColorPrimary']);expect((Math.max(bg,text)+.05)/(Math.min(bg,text)+.05)).toBeGreaterThanOrEqual(4.5);}
  expect(keep).toContain('@style/'+name);
 });
}
