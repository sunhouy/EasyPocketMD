import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {codeEnvironmentHelp} from '../../js/code-runner-help';
import {canRunLanguage,isSandboxLanguage} from '../../shared/code-runner-languages';
it('executes actual native programs through repeated JSON input events',()=>{
    const result=spawnSync('python',['tests/fixtures/native-interactive.py','-v'],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8',timeout:45000});
    expect(result.error).toBeUndefined();
    if(result.status!==0) throw Error(result.stdout+result.stderr);
    expect(result.status).toBe(0);
},50000);
it.each(['java','c','cpp','c++','bash','shell','sh'])('%s is runnable and exposes sandbox file tools',language=>{
    expect(canRunLanguage(language)).toBe(true);expect(isSandboxLanguage(language)).toBe(true);
});
it('keeps help specific to the selected language and lists all supported languages',()=>{
    const java=codeEnvironmentHelp('java');
    expect(java).toContain('Scanner');expect(java).not.toContain('Python 3.12');expect(java).not.toContain('G++ 编译');
    expect(java).toContain('支持的语言：Python、Java、C、C++、Bash/Shell、JavaScript、TypeScript、HTML。');
    expect(codeEnvironmentHelp('html')).not.toContain('文件：上传');
    expect(codeEnvironmentHelp('cpp',true)).toContain('G++ (C++17)');
});
