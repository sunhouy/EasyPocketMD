import { runPythonSandbox } from '../api/services/python-sandbox';
import assert from 'node:assert/strict';
async function main() {
    const result = await runPythonSandbox("import numpy, pandas, scipy, sympy, sklearn, seaborn, PIL, openpyxl\nimport matplotlib.pyplot as plt\nplt.plot([1,2],[3,4]); plt.title('中文图表'); plt.show()\nplt.figure(); plt.plot([3,2,1]); print('ok')");
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.output.trim(), 'ok'); assert.equal(result.images.length, 2);
    assert.equal(result.images[0].mime, 'image/png');
    const isolated = await runPythonSandbox("import os, socket\nassert not os.path.exists('/var/run/docker.sock')\nassert 'JWT_SECRET' not in os.environ\ntry:\n socket.create_connection(('1.1.1.1',443), timeout=1)\n raise RuntimeError('network unexpectedly available')\nexcept OSError:\n print('isolated')");
    assert.equal(isolated.success, true, JSON.stringify(isolated));
    const timeout = await runPythonSandbox('while True: pass');
    assert.equal(timeout.status, 408, JSON.stringify(timeout));
    const next = await runPythonSandbox("print('after timeout')");
    assert.equal(next.success, true, JSON.stringify(next));
    console.log('Python sandbox: plots, Chinese fonts, isolation, timeout and recovery passed');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
