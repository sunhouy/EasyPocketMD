export {};
const fs = jest.requireActual('fs'), os = require('os'), path = require('path');
const {spawnSync} = require('child_process'), yaml = require('js-yaml');
const root = path.resolve(__dirname, '../..');
const workflow = yaml.load(fs.readFileSync(path.join(root, '.gitcode/workflows/domestic-deploy.yml'), 'utf8'));

it('deploys trusted branches from AtomGit with native settings and runtime-only secrets', () => {
    expect(workflow.on.push.branches).toEqual(['main', 'dev']);
    expect(workflow.on.pull_request).toBeUndefined();
    expect(workflow.concurrency).toMatchObject({enable:true, max:1, 'exceed-action':'QUEUE', preemption:{enable:false}});
    const job = workflow.jobs.deploy, steps = job.steps;
    expect(job.if).toContain("atomgit.ref == 'refs/heads/main'");
    expect(job.if).toContain("atomgit.ref == 'refs/heads/dev'");
    expect(job.env.GITHUB_RUN_ID).toBe('atomgit-${{ atomgit.run_id }}');
    expect(job.env.GITHUB_RUN_ATTEMPT).toBe('${{ atomgit.run_attempt }}');
    const transfer = steps.find(s => s.name === 'Deploy directly to domestic server');
    expect(transfer.env.SERVER_HOST).toBe('${{ secrets.SERVER_HOST }}');
    expect(transfer.env.SSHPASS).toBe('${{ secrets.SERVER_PASSWORD }}');
    expect(transfer.run).not.toContain('IP_US');
    const prepare = steps.find(s => s.name === 'Prepare private runtime configuration');
    expect(prepare.env.DB_HOST).toBe('${{ secrets.DB_HOST }}');
    expect(steps.indexOf(transfer)).toBeGreaterThan(steps.findIndex(s => s.name === 'Verify isolated sandbox before deployment'));
    expect(steps.indexOf(transfer)).toBeGreaterThan(steps.findIndex(s => s.name === 'Validate origin gateway'));
    expect(steps.at(-1)).toMatchObject({if:'${{ always() }}'});
    const ignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8').split('\n');
    expect(ignore).toEqual(expect.arrayContaining(['.ci-cache','docker-control','docker-control-us']));
    for (const step of steps.filter(s => s.uses === 'cache')) expect(step.with.path).not.toContain('docker-control');
});

it.each([false, true])('builds locally cached images and stops on failures: %s', fail => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'epmd-atomgit-build-'));
    try {
        fs.mkdirSync(path.join(temp, 'bin'));
        fs.mkdirSync(path.join(temp, '.ci-cache/buildx/python'), {recursive:true});
        fs.writeFileSync(path.join(temp, '.ci-cache/buildx/python/index.json'), 'old-cache');
        fs.writeFileSync(path.join(temp, 'bin/docker'), `#!/bin/bash
printf '%s\\n' "$*" >> "$CALLS"
if [ "$1" = tag ]; then exit 0; fi
if [ "$FAIL_BUILD" = true ]; then exit 23; fi
for option in "$@"; do
  if [[ "$option" = type=local,dest=* ]]; then
    output="\${option#type=local,dest=}"; output="\${output%,mode=max}"
    mkdir -p "$output"; echo new-cache > "$output/index.json"
  fi
done
`, {mode:0o755});
        const result = spawnSync('bash', [path.join(root, 'scripts/build-atomgit-images.sh')], {cwd:temp, encoding:'utf8', timeout:10000,
            env:{...process.env, PATH:path.join(temp,'bin')+path.delimiter+process.env.PATH, ATOMGIT_SHA:'a'.repeat(40), CALLS:path.join(temp,'calls'), FAIL_BUILD:String(fail)}});
        const calls = fs.readFileSync(path.join(temp,'calls'),'utf8');
        expect(result.status).toBe(fail ? 23 : 0);
        expect(calls).toContain('--cache-from type=local,src=.ci-cache/buildx/python');
        expect(calls).not.toContain('type=gha');
        expect(calls).not.toContain('--push');
        const cache = fs.readFileSync(path.join(temp,'.ci-cache/buildx/python/index.json'),'utf8');
        if (fail) { expect(cache).toBe('old-cache'); expect(calls).not.toContain('--target app'); }
        else {
            expect(cache).toContain('new-cache');
            for (const target of ['app','print','gateway']) expect(calls).toContain('--target '+target);
            expect(calls).toContain('tag easypocketmd-python:'+'a'.repeat(40)+' easypocketmd-python:1');
        }
    } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});

it.each([0, 17])('GitHub skips domestic transfer and propagates US status %i after cutover', status => {
    const github = yaml.load(fs.readFileSync(path.join(root,'.github/workflows/docker-deploy.yml'),'utf8'));
    const step = github.jobs.deploy.steps.find(s => s.name === 'Transfer missing image objects and activate Docker release');
    expect(step.env.DOMESTIC_DEPLOY_PROVIDER).toBe('${{ vars.DOMESTIC_DEPLOY_PROVIDER }}');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'epmd-atomgit-cutover-'));
    try {
        fs.mkdirSync(path.join(temp,'scripts'));
        fs.writeFileSync(path.join(temp,'scripts/select-deploy-route.py'),'raise RuntimeError("origin probe must be skipped")\n');
        fs.writeFileSync(path.join(temp,'scripts/transfer-docker-release.sh'), '#!/bin/bash\ntest "$SERVER_HOST" = us || exit 99\necho us > "$RUNNER_TEMP/calls"\nexit "$US_STATUS"\n');
        const result = spawnSync('bash',['-e','-c',step.run.replaceAll('${{ inputs.channel }}','main')],{cwd:temp,encoding:'utf8',timeout:10000,
            env:{...process.env,RUNNER_TEMP:temp,SERVER_HOST:'origin',IP_US:'us',SSHKEY_US:'fixture-key',DOMESTIC_DEPLOY_PROVIDER:'atomgit',US_STATUS:String(status)}});
        expect(result.status).toBe(status ? 1 : 0);
        expect(fs.readFileSync(path.join(temp,'calls'),'utf8').trim()).toBe('us');
        expect(fs.existsSync(path.join(temp,'epmd-us-key'))).toBe(false);
    } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
