const express = require('express');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const router = express.Router();

function toErrorMessage(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    return error.message || String(error);
}

function shellQuote(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function buildShellCommand(command, args, envScriptPath) {
    const segments = [];
    if (envScriptPath) {
        segments.push('source ' + shellQuote(envScriptPath) + ' >/dev/null 2>&1');
    }
    segments.push([shellQuote(command)].concat(args.map(shellQuote)).join(' '));
    return segments.join(' && ');
}

function runCommand(command, args, options) {
    const timeoutMs = options && options.timeoutMs ? options.timeoutMs : 15000;
    const cwd = options && options.cwd ? options.cwd : process.cwd();
    const env = options && options.env ? options.env : process.env;

    return new Promise(function(resolve) {
        let settled = false;
        let stdout = '';
        let stderr = '';
        let timer = null;

        function finish(result) {
            if (settled) return;
            settled = true;
            if (timer) {
                clearTimeout(timer);
            }
            resolve(result);
        }

        let child;
        try {
            child = spawn(command, args, {
                cwd: cwd,
                env: env,
                shell: false
            });
        } catch (error) {
            finish({ code: -1, stdout: '', stderr: toErrorMessage(error), error: error });
            return;
        }

        timer = setTimeout(function() {
            if (child && !child.killed) {
                child.kill('SIGKILL');
            }
            finish({ code: -1, stdout: stdout, stderr: stderr || 'Execution timed out', timedOut: true });
        }, timeoutMs);

        child.stdout.on('data', function(chunk) {
            stdout += chunk.toString('utf8');
        });

        child.stderr.on('data', function(chunk) {
            stderr += chunk.toString('utf8');
        });

        child.on('error', function(error) {
            finish({ code: -1, stdout: stdout, stderr: stderr || toErrorMessage(error), error: error });
        });

        child.on('close', function(code) {
            finish({ code: code, stdout: stdout, stderr: stderr });
        });
    });
}

async function compileAndRunSource(code, language) {
    const normalizedLanguage = String(language || '').toLowerCase();
    const isCpp = normalizedLanguage === 'cpp' || normalizedLanguage === 'c++';
    const compiler = isCpp ? (process.env.EMXX || 'em++') : (process.env.EMCC || 'emcc');
    const envScriptPath = path.join(__dirname, '../../emsdk/emsdk_env.sh');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'easypocketmd-code-runner-'));
    const sourceFile = path.join(tempDir, isCpp ? 'main.cpp' : 'main.c');
    const outputFile = path.join(tempDir, 'runner.js');
    const wrapperFile = path.join(tempDir, 'run.js');

    try {
        await fs.writeFile(sourceFile, String(code || ''), 'utf8');

        const compileArgs = [
            sourceFile,
            '-O2',
            '-s', 'MODULARIZE=1',
            '-s', 'EXPORT_NAME=createCodeRunnerModule',
            '-s', 'ENVIRONMENT=node',
            '-s', 'SINGLE_FILE=1',
            '-s', 'ALLOW_MEMORY_GROWTH=1',
            '-s', 'EXIT_RUNTIME=1',
            '-o', outputFile
        ];

        let compileResult = await runCommand(compiler, compileArgs, { cwd: tempDir, timeoutMs: 30000 });
        if (compileResult.code !== 0 && compileResult.error && compileResult.error.code === 'ENOENT' && envScriptPath) {
            compileResult = await runCommand('bash', ['-lc', buildShellCommand(compiler, compileArgs, envScriptPath)], { cwd: tempDir, timeoutMs: 30000 });
        }

        if (compileResult.code !== 0) {
            return {
                success: false,
                phase: 'compile',
                error: compileResult.stderr || compileResult.stdout || ('Compilation failed with exit code ' + compileResult.code)
            };
        }

        const wrapperSource = [
            "const createCodeRunnerModule = require('./runner.js');",
            "Promise.resolve(createCodeRunnerModule({",
            "  print: function(text) { process.stdout.write(String(text) + '\\n'); },",
            "  printErr: function(text) { process.stderr.write(String(text) + '\\n'); }",
            "})).then(function() {",
            "  process.exit(0);",
            "}).catch(function(error) {",
            "  console.error(error && error.stack ? error.stack : String(error));",
            "  process.exit(1);",
            "});"
        ].join('\n');

        await fs.writeFile(wrapperFile, wrapperSource, 'utf8');

        const runResult = await runCommand(process.execPath, [wrapperFile], { cwd: tempDir, timeoutMs: 15000 });
        if (runResult.code !== 0) {
            return {
                success: false,
                phase: 'runtime',
                error: runResult.stderr || runResult.stdout || ('Program exited with code ' + runResult.code)
            };
        }

        return {
            success: true,
            output: [runResult.stdout, runResult.stderr].filter(Boolean).join('')
        };
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

router.post('/run', async (req, res) => {
    try {
        const code = String(req.body && req.body.code ? req.body.code : '');
        const language = String(req.body && req.body.language ? req.body.language : '').toLowerCase();

        if (!code.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Code is required'
            });
        }

        if (language !== 'c' && language !== 'cpp' && language !== 'c++') {
            return res.status(400).json({
                success: false,
                error: 'Only C and C++ are supported by the server runner'
            });
        }

        const result = await compileAndRunSource(code, language);
        if (!result.success) {
            return res.status(500).json(result);
        }

        return res.json(result);
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: toErrorMessage(error)
        });
    }
});

module.exports = router;