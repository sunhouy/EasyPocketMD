import { runPythonSandbox } from '../api/services/python-sandbox';
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
