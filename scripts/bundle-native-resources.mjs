// Build-time only: bundle public Live2D models; runtime loading remains lazy.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,mkdirSync,cpSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const catalog=readFileSync(join(root,'js/main/live2d-models.ts'),'utf8');
const models=[...catalog.matchAll(/(\w+): 'https:\/\/cdn\.jsdelivr\.net\/npm\/(live2d-widget-model-[^@]+)@([\d.]+)\/assets\/([^']+)'/g)];
if(!models.length)throw Error('Live2D catalog is empty');
const output=join(root,'.native-resources','live2d');mkdirSync(output,{recursive:true});
for(const [,model,pkg,version,manifest] of models){
 const temp=mkdtempSync(join(tmpdir(),'epmd-model-'));
 try{
  const info=JSON.parse(execFileSync('npm',['pack',pkg+'@'+version,'--json','--pack-destination',temp],{encoding:'utf8'}));
  execFileSync('tar',['-xzf',join(temp,info[0].filename),'-C',temp]);
  const source=join(temp,'package');const dest=join(output,model);mkdirSync(dest,{recursive:true});
  cpSync(join(source,'assets'),dest,{recursive:true});
  const metadata=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));
  writeFileSync(join(dest,'package-license.json'),JSON.stringify({name:pkg,version,license:metadata.license,repository:metadata.repository},null,2));
  for(const name of ['LICENSE','LICENSE.md','LICENSE.txt']){try{cpSync(join(source,name),join(dest,name));}catch(error){if(error.code!=='ENOENT')throw error;}}
  JSON.parse(readFileSync(join(dest,manifest),'utf8'));
  console.log('Bundled '+pkg+'@'+version);
 }finally{rmSync(temp,{recursive:true,force:true});}
}
