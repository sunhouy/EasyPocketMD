export {};
const fs = jest.requireActual('fs'), path = require('path');
const {spawnSync} = require('child_process'), yaml = require('js-yaml');
const root = path.resolve(__dirname, '../..');
it('archives public deployable images before network transfer and excludes secrets', () => {
    const workflow = yaml.load(fs.readFileSync(path.join(root,'.github/workflows/docker-deploy.yml'),'utf8'));
    const steps = workflow.jobs.deploy.steps;
    const archive = steps.findIndex(s => s.name === 'Archive deployable images before server upload');
    expect(archive).toBeGreaterThan(steps.findIndex(s => s.name === 'Prepare private runtime configuration'));
    expect(archive).toBeLessThan(steps.findIndex(s => s.name === 'Transfer missing image objects and activate Docker release'));
    expect(steps[archive].with).toMatchObject({path:'docker-release/',name:'docker-release-${{ inputs.channel }}','retention-days':90,'compression-level':0});
    const result = spawnSync('python3',[path.join(root,'tests/fixtures/manual-deployment.py')],{encoding:'utf8',timeout:10000});
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Ran 5 tests');
});
