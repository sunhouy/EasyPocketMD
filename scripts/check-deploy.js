const { execSync } = require('child_process');

const colors = {
    green: (msg) => `\x1b[32m${msg}\x1b[0m`,
    red: (msg) => `\x1b[31m${msg}\x1b[0m`,
    yellow: (msg) => `\x1b[33m${msg}\x1b[0m`,
    cyan: (msg) => `\x1b[36m${msg}\x1b[0m`
};


try {
    execSync('npm test', { stdio: 'inherit' });
    execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
    console.error(colors.red('\nPre-deployment checks failed!'));
    process.exit(1);
}