const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '../..');
const SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'markitdown_import.py');
const MAX_MARKDOWN_BYTES = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120000;

const SUPPORTED_EXTENSIONS = new Set([
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx'
]);

function getFileExtension(fileName) {
    return path.extname(String(fileName || '')).toLowerCase();
}

function isSupportedImportFile(fileName) {
    return SUPPORTED_EXTENSIONS.has(getFileExtension(fileName));
}

function getPythonExecutable() {
    if (process.env.MARKITDOWN_PYTHON) {
        return process.env.MARKITDOWN_PYTHON;
    }

    const venvPython = process.platform === 'win32'
        ? path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe')
        : path.join(PROJECT_ROOT, '.venv', 'bin', 'python');

    if (fs.existsSync(venvPython)) {
        return venvPython;
    }

    return process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
}

function normalizePythonError(stderr, exitCode) {
    const text = String(stderr || '').trim();
    if (exitCode === 2 || /No module named ['"]?markitdown/i.test(text)) {
        return {
            code: 'DEPENDENCY_MISSING',
            message: 'MarkItDown Python 依赖未安装，请确认部署流程已安装 requirements.txt'
        };
    }
    return {
        code: 'CONVERT_FAILED',
        message: text || '文档转换失败'
    };
}

function convertFileToMarkdown(filePath, options = {}) {
    return new Promise((resolve, reject) => {
        const python = getPythonExecutable();
        const args = [SCRIPT_PATH, filePath];
        const child = spawn(python, args, {
            cwd: PROJECT_ROOT,
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8'
            },
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';
        let stdoutBytes = 0;
        let finished = false;

        const timeout = setTimeout(() => {
            if (finished) return;
            finished = true;
            child.kill('SIGKILL');
            const err = new Error('文档转换超时，请稍后重试或拆分文件');
            err.code = 'CONVERT_TIMEOUT';
            reject(err);
        }, options.timeoutMs || DEFAULT_TIMEOUT_MS);

        child.stdout.on('data', chunk => {
            stdoutBytes += chunk.length;
            if (stdoutBytes > MAX_MARKDOWN_BYTES) {
                if (!finished) {
                    finished = true;
                    clearTimeout(timeout);
                    child.kill('SIGKILL');
                    const err = new Error('转换后的 Markdown 内容过大，请拆分文件后重试');
                    err.code = 'OUTPUT_TOO_LARGE';
                    reject(err);
                }
                return;
            }
            stdout += chunk.toString('utf8');
        });

        child.stderr.on('data', chunk => {
            stderr += chunk.toString('utf8');
        });

        child.on('error', error => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            const err = new Error(`无法启动 Python 转换进程: ${error.message}`);
            err.code = error.code === 'ENOENT' ? 'PYTHON_NOT_FOUND' : 'CONVERT_FAILED';
            reject(err);
        });

        child.on('close', exitCode => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);

            if (exitCode !== 0) {
                const normalized = normalizePythonError(stderr, exitCode);
                const err = new Error(normalized.message);
                err.code = normalized.code;
                reject(err);
                return;
            }

            const markdown = stdout.trim();
            if (!markdown) {
                const err = new Error('未从文档中提取到可导入内容');
                err.code = 'EMPTY_OUTPUT';
                reject(err);
                return;
            }

            resolve({
                markdown,
                originalName: options.originalName || path.basename(filePath)
            });
        });
    });
}

module.exports = {
    convertFileToMarkdown,
    isSupportedImportFile,
    getFileExtension,
    SUPPORTED_EXTENSIONS
};
