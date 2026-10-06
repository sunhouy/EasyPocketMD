export {};
const fs = jest.requireActual('fs'), os = require('os'), path = require('path');
const {spawnSync} = require('child_process'), yaml = require('js-yaml');
const root = path.resolve(__dirname, '../..');

it.each(['deploy.yml', 'dev-deploy.yml'])('reuses exact sandbox images and saves only verified cache entries in %s', file => {
    const steps = yaml.load(fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8')).jobs.test.steps;
    const restore = steps.find(s => s.id === 'sandbox-image-cache');
    expect(restore.with.key).toContain("hashFiles('sandbox/python/Dockerfile', 'sandbox/python/requirements.txt', 'sandbox/python/runner.py')");
    expect(restore.with['restore-keys']).toBeUndefined();
    const build = steps.find(s => s.name === 'Build sandbox with persistent dependency layers');
    expect(build.if).toContain("cache-hit != 'true'");
    expect(build.with['cache-from']).toContain('type=gha');
    const save = steps.findIndex(s => s.name === 'Cache sandbox image after portability verification');
    expect(save).toBeGreaterThan(steps.findIndex(s => s.name === 'Verify sandbox image in a separate Docker engine'));
    expect(steps[save].with.key).toBe('${{ steps.sandbox-image-cache.outputs.cache-primary-key }}');
    const verify = steps.find(s => s.name === 'Build and verify isolated Python runner');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'epmd-cache-'));
    try {
        fs.mkdirSync(path.join(temp, 'scripts')); fs.mkdirSync(path.join(temp, 'bin'));
        for (const script of ['setup-python-sandbox.sh', 'export-python-sandbox.sh'])
            fs.writeFileSync(path.join(temp, 'scripts', script), `#!/bin/bash\necho '${script}' "$1" >> "$RUNNER_TEMP/calls"\n`);
        fs.writeFileSync(path.join(temp, 'bin/npx'), '#!/bin/bash\necho check-runtime >> "$RUNNER_TEMP/calls"\n', {mode: 0o755});
        for (const hit of ['true', 'false']) {
            const calls = path.join(temp, 'calls'); fs.writeFileSync(calls, '');
            const result = spawnSync('bash', ['-e', '-c', verify.run], {cwd: temp, encoding: 'utf8', timeout: 10000,
                env: {...process.env, PATH: path.join(temp, 'bin') + path.delimiter + process.env.PATH, RUNNER_TEMP: temp, SANDBOX_CACHE_HIT: hit}});
            expect(result.status).toBe(0);
            const log = fs.readFileSync(calls, 'utf8');
            expect(log).toContain('check-runtime');
            expect(log).not.toContain('--build');
            if (hit === 'true') { expect(log).toContain('--load'); expect(log).not.toContain('export-python'); }
            else { expect(log).toContain('--check'); expect(log).toContain('export-python'); }
        }
    } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

it.each([0, 23])('reports transfer stages and stops activation on rsync status %i', status => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'epmd-progress-'));
    try {
        const bin = path.join(temp, 'bin'); fs.mkdirSync(bin);
        fs.writeFileSync(path.join(bin, 'sshpass'), '#!/bin/bash\nshift\nexec "$@"\n', {mode: 0o755});
        fs.writeFileSync(path.join(bin, 'ssh'), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$CALLS"\n', {mode: 0o755});
        fs.writeFileSync(path.join(bin, 'rsync'), '#!/bin/bash\nprintf "%s\\n" "$*" >> "$CALLS"\nif [[ "$*" = *--ignore-existing* ]]; then exit "$TRANSFER_STATUS"; fi\n', {mode: 0o755});
        const calls = path.join(temp, 'calls');
        const result = spawnSync('bash', [path.join(root, 'scripts/transfer-docker-release.sh'), 'main', 'deploy'], {
            encoding: 'utf8', timeout: 10000, env: {...process.env, PATH: bin + path.delimiter + process.env.PATH,
                GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1', SERVER_USER: 'test', SERVER_HOST: 'example', SERVER_SSH_HOST_KEY: '',
                SERVER_SSH_KEY_FILE: '', SSHPASS: 'fixture-secret', DEPLOY_TARGET_LABEL: 'us', CALLS: calls, TRANSFER_STATUS: String(status)}});
        expect(result.status).toBe(status);
        const log = result.stdout + result.stderr, commands = fs.readFileSync(calls, 'utf8');
        expect(log).toContain('[us/main] START Upload missing image objects');
        expect(log).not.toContain('fixture-secret');
        expect(commands).toContain('--info=progress2'); expect(commands).toContain('--timeout=300');
        expect(commands).not.toContain('--bwlimit');
        if (status) { expect(log).toContain('FAILED Upload missing image objects'); expect(log).not.toContain('START Verify/import'); }
        else { expect(log).toContain('DONE Upload missing image objects'); expect(log).toContain('DONE Verify/import'); }
    } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

it('reports unique missing byte counts and preserves remote stage failures', () => {
    const result = spawnSync('python3', [path.join(root, 'tests/fixtures/deployment-progress.py')], {encoding: 'utf8', timeout: 10000});
    expect(result.status).toBe(0); expect(result.stderr + result.stdout).not.toContain('FAILED');
});
