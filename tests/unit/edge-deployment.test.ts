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

it.each([[0, 0, 0], [1, 0, 1], [0, 1, 1]])('waits for both destinations and reports original=%i / US=%i failures', (original, us, expected) => {
    const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/docker-deploy.yml'), 'utf8'));
    const step = workflow.jobs.deploy.steps.find((s: any) => s.name === 'Transfer missing image objects and activate Docker release');
    expect(step.env.IP_US).toBe('${{ secrets.IP_US }}');
    expect(step.env.SSHKEY_US).toBe('${{ secrets.SSHKEY_US }}');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'epmd-edge-'));
    try {
        fs.mkdirSync(path.join(temp, 'scripts'));
        fs.writeFileSync(path.join(temp, 'scripts/transfer-docker-release.sh'), `#!/bin/bash
if [ "$SERVER_HOST" = us ]; then
  test "$(stat -c %a "$SERVER_SSH_KEY_FILE")" = 600 || exit 9
  test "$(cat "$SERVER_SSH_KEY_FILE")" = fake-key || exit 9
  test "$DEPLOY_IMAGE_DIR" = image-cas-us || exit 9
  echo us >> "$RUNNER_TEMP/completed"
  exit "$US_STATUS"
fi
echo original >> "$RUNNER_TEMP/completed"
exit "$ORIGINAL_STATUS"
`);
        const result = spawnSync('bash', ['-e', '-c', step.run.replaceAll('${{ inputs.channel }}', 'main')], {
            cwd: temp, encoding: 'utf8', timeout: 10000,
            env: {...process.env, RUNNER_TEMP: temp, SERVER_HOST: 'original', IP_US: 'us', SSHKEY_US: 'fake-key', ORIGINAL_STATUS: String(original), US_STATUS: String(us)}
        });
        expect(result.status).toBe(expected);
        expect(fs.readFileSync(path.join(temp, 'completed'), 'utf8').trim().split('\n').sort()).toEqual(['original', 'us']);
        expect(fs.existsSync(path.join(temp, 'epmd-us-key'))).toBe(false);
    } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});
