import {spawnSync} from 'node:child_process';
import path from 'node:path';
it('preserves sanitized edge failure diagnostics', () => {
    const result = spawnSync('python3', [path.resolve(__dirname, '../fixtures/edge-health-route.py')], {encoding:'utf8', timeout:10000});
    expect(result.stderr + result.stdout).not.toContain('FAILED');
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Ran 2 tests');
});
