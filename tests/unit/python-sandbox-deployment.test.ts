export {};
const fs=jest.requireActual('fs'),os=require('os'),path=require('path');
const {spawnSync}=require('child_process');
const yaml=require('js-yaml');
const root=path.resolve(__dirname,'../..');
let temp,env;
beforeEach(()=>{
    temp=fs.mkdtempSync(path.join(os.tmpdir(),'epmd-sandbox-deploy-'));
    const bin=path.join(temp,'bin');fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin,'docker'),`#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_CALLS"
case "$1" in
 info) exit 0 ;;
 image) cat "$DOCKER_INSPECT" ;;
 save) printf 'saved-image-archive' ;;
 load) exit 0 ;;
 run) printf '{"success":true,"images":[{"mime":"image/png","data":"fixture"}]}' ;;
 *) echo 'Unexpected network/build operation' >&2; exit 1 ;;
esac
`,{mode:0o755});
    env={...process.env,PATH:bin+path.delimiter+process.env.PATH,DOCKER_CALLS:path.join(temp,'calls')};
    env.DOCKER_INSPECT=path.join(temp,'inspect.json');
    fs.writeFileSync(env.DOCKER_INSPECT,JSON.stringify([{
        Id:'sha256:ci-index',Os:'linux',Architecture:'amd64',
        RootFS:{Type:'layers',Layers:['sha256:layer1','sha256:layer2']},
        Config:{User:'65534:65534',Env:['MPLBACKEND=Agg'],Entrypoint:['python','-I','/runner/runner.py'],Cmd:null,Labels:{}}
    }]));
    delete env.PYTHON_SANDBOX_IMAGE;
});
afterEach(()=>fs.rmSync(temp,{recursive:true,force:true}));
function execute(script,args=[]){return spawnSync('bash',[path.join(root,script),...args],{cwd:root,env,encoding:'utf8',timeout:10000});}
function exportImage(){const result=execute('scripts/export-python-sandbox.sh',[path.join(temp,'image')]);expect(result.status).toBe(0);return path.join(temp,'image/python-sandbox.tar.gz');}
it('imports the CI artifact without any registry pull or server build',()=>{
    const archive=exportImage();fs.writeFileSync(env.DOCKER_CALLS,'');
    const result=execute('scripts/setup-python-sandbox.sh',['--load',archive]);
    expect(result.status).toBe(0);
    const calls=fs.readFileSync(env.DOCKER_CALLS,'utf8');
    expect(calls).toContain('load --input '+archive);
    expect(calls).toContain('run --rm --pull=never');
    expect(calls).not.toMatch(/^(pull|build|save) /m);
});
it('rejects a corrupt archive before contacting Docker',()=>{
    const archive=exportImage();fs.writeFileSync(env.DOCKER_CALLS,'');fs.appendFileSync(archive,'corruption');
    const result=execute('scripts/setup-python-sandbox.sh',['--load',archive]);
    expect(result.status).not.toBe(0);expect(fs.readFileSync(env.DOCKER_CALLS,'utf8')).toBe('');
});
it('fails closed on a missing archive instead of building automatically',()=>{
    const result=execute('scripts/setup-python-sandbox.sh',['--load',path.join(temp,'missing.tar.gz')]);
    expect(result.status).not.toBe(0);expect(result.stderr).toContain('refusing to pull or build');
    expect(fs.existsSync(env.DOCKER_CALLS)).toBe(false);
});
function changeLoadedImage(update){
    const images=JSON.parse(fs.readFileSync(env.DOCKER_INSPECT,'utf8'));
    update(images[0]);fs.writeFileSync(env.DOCKER_INSPECT,JSON.stringify(images));
}
it('accepts identical image content with different IDs across Docker stores',()=>{
    const archive=exportImage();
    changeLoadedImage(image=>{image.Id='sha256:server-config';image.Config.Labels=null;image.Config.Shell=[];});
    const result=execute('scripts/setup-python-sandbox.sh',['--load',archive]);
    expect(result.status).toBe(0);expect(result.stdout).toContain('configuration match CI artifact');
});
it.each([
    ['layers',image=>image.RootFS.Layers.reverse()],
    ['entrypoint',image=>image.Config.Entrypoint=['/different/runner']],
    ['environment',image=>image.Config.Env=['MPLBACKEND=Other']],
    ['user',image=>image.Config.User='0'],
    ['architecture',image=>image.Architecture='arm64'],
])('rejects changed %s before executing containers',(_name,update)=>{
    const archive=exportImage();fs.writeFileSync(env.DOCKER_CALLS,'');changeLoadedImage(update);
    const result=execute('scripts/setup-python-sandbox.sh',['--load',archive]);
    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(env.DOCKER_CALLS,'utf8')).not.toMatch(/^run /m);
});
it('rejects changed identity metadata before contacting Docker',()=>{
    const archive=exportImage();fs.writeFileSync(env.DOCKER_CALLS,'');
    fs.appendFileSync(path.join(temp,'image/python-sandbox.image.json'),'corruption');
    const result=execute('scripts/setup-python-sandbox.sh',['--load',archive]);
    expect(result.status).not.toBe(0);expect(fs.readFileSync(env.DOCKER_CALLS,'utf8')).toBe('');
});
it.each(['deploy.yml','dev-deploy.yml'])('uploads the tested artifact and only loads it remotely in %s',file=>{
    const workflow=yaml.load(fs.readFileSync(path.join(root,'.github/workflows',file),'utf8'));
    const test=workflow.jobs.test.steps;
    expect(test.find(step=>step.name==='Verify sandbox image in a separate Docker engine').run).toContain('check-sandbox-image-portability.sh');
    expect(test.find(step=>step.name==='Upload verified Python sandbox image').uses).toBe('actions/upload-artifact@v4');
    const deploy=workflow.jobs.deploy.steps;
    expect(deploy.find(step=>step.name==='Download verified Python sandbox image').uses).toBe('actions/download-artifact@v4');
    const tar=deploy.find(step=>step.name==='Create deployment tarball').run;
    expect(tar).toContain('cp python-sandbox-image/python-sandbox.tar.gz');
    const server=deploy.filter(step=>step.uses?.includes('ssh-action')).map(step=>step.with.script).join('\n');
    expect(server).toContain('setup-python-sandbox.sh --load sandbox/python/python-sandbox.tar.gz');
    expect(server).not.toContain('setup-python-sandbox.sh --build');
    expect(server).toContain('https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple');
});
