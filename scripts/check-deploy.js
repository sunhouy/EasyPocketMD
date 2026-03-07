const { execSync } = require('child_process');

// Simple color function
const colors = {
    green: (msg) => `\x1b[32m${msg}\x1b[0m`,
    red: (msg) => `\x1b[31m${msg}\x1b[0m`,
    yellow: (msg) => `\x1b[33m${msg}\x1b[0m`,
    cyan: (msg) => `\x1b[36m${msg}\x1b[0m`
};

console.log(colors.cyan('Starting pre-deployment checks...'));

try {
    // 1. Run tests
    console.log(colors.yellow('Running tests...'));
    execSync('npm test', { stdio: 'inherit' });
    console.log(colors.green('Tests passed!'));

    // 2. Build verification
    console.log(colors.yellow('Verifying build...'));
    execSync('npm run build', { stdio: 'inherit' });
    console.log(colors.green('Build verification passed!'));

    console.log(colors.green('\nAll checks passed! Ready for deployment.'));
    // process.exit(0) is default on success
} catch (error) {
    console.error(colors.red('\nPre-deployment checks failed!'));
    // execSync throws on error, error message might be empty if stdio is inherit
    process.exit(1);
}
