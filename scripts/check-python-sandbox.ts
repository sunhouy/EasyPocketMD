import { runPythonSandbox, type SandboxResult } from '../api/services/python-sandbox';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
async function main() {
    const prompts: string[] = [];
    const interactive = await runPythonSandbox("name=input('姓名：')\nprint('你好',name)\nimport sys\nprint('下一行',sys.stdin.readline().strip())", undefined, async event => {
        prompts.push(event.prompt);
        return prompts.length === 1 ? '小明' : '第二行';
    });
    assert.equal(interactive.success, true, JSON.stringify(interactive));
    assert.deepEqual(prompts, ['姓名：','']);
    assert.match(interactive.output, /你好 小明/);
    assert.match(interactive.output, /下一行 第二行/);
    if (process.argv.includes('--input-only')) return;
    const java = await runPythonSandbox('package demo; public class Hello { public static void main(String[] args) { System.out.println("你好 Java"); } }', undefined, undefined, [], {language:'java'});
    assert.equal(java.success, true, JSON.stringify(java));
    assert.equal(java.output.trim(), '你好 Java');
    for (const language of ['bash','shell','sh']) {
        const shell = await runPythonSandbox('printf "你好 Shell\\n"', undefined, undefined, [], {language});
        assert.equal(shell.success, true, JSON.stringify(shell));
        assert.equal(shell.output.trim(), '你好 Shell');
    }
    const programs = [
        {language:'c',code:'#include <stdio.h>\nint main(){int a,b; printf("first: "); scanf("%d",&a); printf("second: "); scanf("%d",&b); printf("sum=%d\\n",a+b);}'},
        {language:'cpp',code:'#include <iostream>\nint main(){int a,b; std::cin>>a; std::cin>>b; std::cout<<"sum="<<a+b<<"\\n";}'},
        {language:'java',code:'import java.util.Scanner; public class Hello { public static void main(String[] args) { Scanner s=new Scanner(System.in); int a=s.nextInt(),b=s.nextInt(); System.out.println("sum="+(a+b)); }}'},
        {language:'bash',code:'read a; read b; printf "sum=%s\\n" "$((a+b))"'},
    ];
    for (const {language,code} of programs) {
        let count=0;
        const result=await runPythonSandbox(code,undefined,async()=>++count===1?'12':'30',[],{language});
        assert.equal(result.success,true,JSON.stringify(result));
        assert.equal(count,2,language+' must accept two inputs');
        assert.match(result.output,/sum=42/);
    }
    const javaFiles: SandboxResult=await runPythonSandbox('import java.nio.file.*; public class Hello { public static void main(String[] args) throws Exception { System.out.print(Files.readString(Path.of("data.txt"))); Files.writeString(Path.of("result.txt"),"完成"); }}',undefined,undefined,[{name:'data.txt',data:Buffer.from('上传文件内容').toString('base64')}],{language:'java',workspace:true});
    assert.equal(javaFiles.success,true,JSON.stringify(javaFiles));
    assert.equal(javaFiles.output,'上传文件内容');
    assert.ok(javaFiles.files, 'Java sandbox must return uploaded/generated files');
    assert.ok(javaFiles.files.some(file=>file.name==='result.txt' && Buffer.from(file.data,'base64').toString()==='完成'));
    const result = await runPythonSandbox("import numpy, pandas, scipy, sympy, sklearn, seaborn, PIL, openpyxl\nimport matplotlib.pyplot as plt\nplt.plot([1,2],[3,4]); plt.title('中文图表'); plt.show()\nplt.figure(); plt.plot([3,2,1]); print('ok')");
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.output.trim(), 'ok'); assert.equal(result.images.length, 2);
    assert.equal(result.images[0].mime, 'image/png');
    const fonts = await runPythonSandbox(readFileSync(new URL('../tests/fixtures/python-chinese-fonts.py', import.meta.url), 'utf8'));
    assert.equal(fonts.success, true, JSON.stringify(fonts));
    assert.equal(fonts.output.trim(), 'Chinese font overrides passed');
    assert.equal(fonts.images.length, 2);
    const isolated = await runPythonSandbox("import os, socket\nassert not os.path.exists('/var/run/docker.sock')\nassert 'JWT_SECRET' not in os.environ\ntry:\n socket.create_connection(('1.1.1.1',443), timeout=1)\n raise RuntimeError('network unexpectedly available')\nexcept OSError:\n print('isolated')");
    assert.equal(isolated.success, true, JSON.stringify(isolated));
    const timeout = await runPythonSandbox('while True: pass');
    assert.equal(timeout.status, 408, JSON.stringify(timeout));
    const next = await runPythonSandbox("print('after timeout')");
    assert.equal(next.success, true, JSON.stringify(next));
    console.log('Python sandbox: plots, Chinese fonts, isolation, timeout and recovery passed');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
