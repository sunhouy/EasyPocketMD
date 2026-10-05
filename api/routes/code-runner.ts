const express = require('express');

const router = express.Router();
const { runPythonSandbox } = require('../services/python-sandbox');
const { stageRunnerFiles, resolveRunnerFiles, removeRunnerFile } = require('../services/code-runner-files');
const workspaceApi = require('../services/runner-workspace');
const runnerUpload = require('multer')({storage:require('multer').memoryStorage(),limits:{fileSize:5*1024*1024,files:8,fields:1,parts:9}}).array('files',8);
let uploading = false;
router.post('/files', (req,res) => {
    if (uploading) return res.status(429).json({success:false,error:'正在处理其他上传，请稍后重试'});
    uploading = true;
    runnerUpload(req,res,error => {
        uploading = false;
        try {
            if (error) throw Error(error.code === 'LIMIT_FILE_SIZE' ? '单个文件不能超过 5 MB' : '文件上传失败或超过数量限制');
            if (req.body.workspace) return res.json({success:true,...workspaceApi.uploadWorkspace(req.body.workspace,req.files || [])});
            return res.json({success:true,files:stageRunnerFiles(req.files || [])});
        } catch (e) { return res.status(400).json({success:false,error:toErrorMessage(e)}); }
    });
});
router.post('/files/remove', (req,res) => { removeRunnerFile(req.body?.token); res.json({success:true}); });
router.post('/workspace', (req,res) => {
    try {
        if(req.body.action==='create') return res.json({success:true,token:workspaceApi.createWorkspace()});
        if(req.body.action==='download') { const data=workspaceApi.readWorkspace(req.body.workspace,req.body.name); return res.type('application/octet-stream').send(data); }
        const result=req.body.action==='delete'?workspaceApi.deleteWorkspace(req.body.workspace,req.body.name):workspaceApi.listWorkspace(req.body.workspace);
        return res.json({success:true,...result});
    } catch(error) { return res.status(400).json({success:false,error:toErrorMessage(error)}); }
});

function toErrorMessage(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    return error.message || String(error);
}

// One-use unpredictable capabilities tie each answer to a single pending input.
const pendingInputs = new Map<string, {resolve: (value: string) => void}>();
router.post('/input', (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const pending = pendingInputs.get(token);
    if (!pending) return res.status(410).json({success:false,error:'Input request expired'});
    if (typeof req.body.value !== 'string' || Buffer.byteLength(req.body.value) > 65536) return res.status(400).json({success:false,error:'Invalid input (64 KB maximum)'});
    pendingInputs.delete(token); pending.resolve(req.body.value);
    res.json({success:true});
});

router.post('/run', async (req, res) => {
    try {
        let code = String(req.body && req.body.code ? req.body.code : '');
        const language = String(req.body && req.body.language ? req.body.language : '').toLowerCase();
        if (req.body.command !== undefined) {
            if (!['python','py'].includes(language) || typeof req.body.command !== 'string' || Buffer.byteLength(req.body.command)>8192) return res.status(400).json({success:false,error:'命令无效或超过 8 KB'});
            const command=JSON.stringify(req.body.command);
            code=`import os, shlex, subprocess\ncommand = ${command}\nparts = shlex.split(command)\nif len(parts) <= 2 and parts and parts[0] == 'cd':\n    target = os.path.realpath(os.path.expanduser(parts[1] if len(parts)>1 else '~'))\n    if target != '/tmp/home' and not target.startswith('/tmp/home/'):\n        raise ValueError('只能进入沙箱用户目录')\n    os.chdir(target)\nelse:\n    completed = subprocess.run(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)\n    print(completed.stdout, end='')\n    if completed.returncode:\n        raise RuntimeError('命令退出码：' + str(completed.returncode))`;
        }

        if (!code.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Code is required'
            });
        }

        if (['python','py','c','cpp','c++','java','bash','shell','sh'].includes(language)) {
            if (Buffer.byteLength(code, 'utf8') > 64 * 1024) return res.status(413).json({success:false,error:'Code exceeds 64 KB limit'});
            let files;
            try { files = resolveRunnerFiles(req.body.files); }
            catch (error) { return res.status(400).json({success:false,error:toErrorMessage(error)}); }
            const controller = new AbortController();
            let workspace;
            if (req.body.workspace) {
                try { workspace=workspaceApi.beginWorkspace(req.body.workspace); files=workspace.files; }
                catch(error) { return res.status(409).json({success:false,error:toErrorMessage(error)}); }
            }
            const cancel = () => { if (!res.writableEnded) controller.abort(); };
            res.once('close', cancel);
            try {
                const interactive = req.body.interactive === true;
                if (interactive) {
                    res.status(200).set({'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});
                    res.flushHeaders();
                }
                const input = interactive ? (event, signal) => new Promise<string>((resolve, reject) => {
                    const token = require('crypto').randomUUID();
                    const cancelInput = () => { pendingInputs.delete(token); reject(new Error('Input cancelled')); };
                    signal.addEventListener('abort', cancelInput, {once:true});
                    pendingInputs.set(token, {resolve: value => {
                        signal.removeEventListener('abort', cancelInput); resolve(value);
                    }});
                    res.write(JSON.stringify({type:'input',token,...event}) + '\n');
                    if (signal.aborted) cancelInput();
                }) : undefined;
                const nativeLanguage = ['c','cpp','c++','java','bash','shell','sh'].includes(language) ? language : undefined;
                const options = { ...(workspace ? {workspace:true,cwd:workspace.cwd,directories:workspace.directories} : {}), ...(nativeLanguage ? {language:nativeLanguage} : {}) };
                const result = (workspace || nativeLanguage) ? await runPythonSandbox(code, controller.signal, input, files, options) : files.length ? await runPythonSandbox(code, controller.signal, input, files) : interactive
                    ? await runPythonSandbox(code, controller.signal, input)
                    : await runPythonSandbox(code, controller.signal);
                workspace?.finish(result);
                if (interactive) {
                    if (!res.destroyed) res.end(JSON.stringify({type:'result',...result}) + '\n');
                    return;
                }
                if (!res.destroyed) return res.status(result.status || 200).json(result);
                return;
            } finally { workspace?.cancel(); res.removeListener('close', cancel); }
        }

        return res.status(400).json({success:false,error:'服务器支持 Python、C、C++、Java、Bash/Shell；请选择支持的代码块语言。'});
    } catch (error) {
        if (res.headersSent) {
            if (!res.destroyed) res.end(JSON.stringify({type:'result',success:false,error:toErrorMessage(error)}) + '\n');
            return;
        }
        return res.status(500).json({
            success: false,
            error: toErrorMessage(error)
        });
    }
});

module.exports = router;
