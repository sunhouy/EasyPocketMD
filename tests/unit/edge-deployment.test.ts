import { spawnSync } from 'node:child_process';
const fs: typeof import('node:fs') = jest.requireActual('node:fs');
import os from 'node:os';
import path from 'node:path';
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '../..');

it('activates a stateless edge and excludes origin runtime credentials', () => {
    const result = spawnSync('python3', [path.join(root, 'tests/fixtures/edge-deployment.py')], {encoding: 'utf8', timeout: 10000});
    expect(result.stderr + result.stdout).not.toContain('FAILED');
    expect(result.status).toBe(0);
});

it.each([0,1])('deploys only to the domestic destination and propagates status %i',status=>{
 const workflow=yaml.load(fs.readFileSync(path.join(root,'.github/workflows/docker-deploy.yml'),'utf8'));
 const step=workflow.jobs.deploy.steps.find((s:any)=>s.name==='Transfer missing image objects and activate Docker release');
 expect(step.env.IP_US).toBeUndefined();expect(step.env.SSHKEY_US).toBeUndefined();
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'epmd-domestic-'));
 try {
  fs.mkdirSync(path.join(temp,'scripts'));fs.writeFileSync(path.join(temp,'scripts/transfer-docker-release.sh'),`#!/bin/bash
printf '%s' "$SERVER_HOST" > "$RUNNER_TEMP/destination"
exit "$ORIGINAL_STATUS"
`);
  const result=spawnSync('bash',['-e','-c',step.run.replaceAll('${{ inputs.channel }}','main')],{cwd:temp,encoding:'utf8',timeout:10000,env:{...process.env,RUNNER_TEMP:temp,SERVER_HOST:'domestic',ORIGINAL_STATUS:String(status)}});
  expect(result.status).toBe(status);expect(fs.readFileSync(path.join(temp,'destination'),'utf8')).toBe('domestic');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
it('has no active workflow upload to the foreign host, including print-client binaries',()=>{
 for(const name of fs.readdirSync(path.join(root,'.github/workflows'))){const source=fs.readFileSync(path.join(root,'.github/workflows',name),'utf8');expect(source).not.toMatch(/secrets\.(IP_US|SSHKEY_US)|prepare-edge-release/);}
});
