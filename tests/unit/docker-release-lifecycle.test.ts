import {spawnSync} from 'node:child_process';
import path from 'node:path';

it('preserves live services during imports and cleans only obsolete project releases after activation', () => {
    const result = spawnSync('python3', [path.resolve(__dirname, '../fixtures/docker-release-lifecycle.py')], {encoding: 'utf8', timeout: 10000});
    expect(result.stderr + result.stdout).not.toContain('FAILED');
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Ran 6 tests');
});
