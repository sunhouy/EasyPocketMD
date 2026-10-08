/** @jest-environment jsdom */
// @ts-nocheck
export {};
const fs=jest.requireActual('fs');
const source=fs.readFileSync(require('path').resolve(__dirname,'../../js/utils.ts'),'utf8');
const start=source.indexOf('    function getApiBaseUrl()');
const end=source.indexOf('    /** 获取应用的基础域名',start);
const resolve=new Function('window','localStorage',source.slice(start,end)+'return getApiBaseUrl();');
it('ignores stored foreign API overrides in production and native clients',()=>{
 const storage={getItem:()=> 'https://foreign.example/api'};
 for(const host of ['md.yhsun.cn','dev.yhsun.cn'])expect(resolve({location:{hostname:host,origin:'https://'+host}},storage)).toBe('https://'+host+'/api');
 expect(resolve({location:{hostname:'tauri.localhost'},__TAURI__:{}},storage)).toBe('https://md.yhsun.cn/api');
 expect(resolve({location:{protocol:'file:'},API_BASE_URL:'https://foreign.example/api'},storage)).toBe('https://md.yhsun.cn/api');
});
it('preserves explicitly configured API roots for independent installations',()=>{
 expect(resolve({location:{hostname:'selfhost.example'}},{getItem:()=> 'https://my-origin.example/api'})).toBe('https://my-origin.example/api');
});
