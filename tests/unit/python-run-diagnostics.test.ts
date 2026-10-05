import { explainPythonError, pythonErrorLine } from '../../js/python-run-diagnostics';
it.each([
    ['ModuleNotFoundError: No module named \'missing_package\'', '找不到模块“missing_package”'],
    ['NameError: name \'total\' is not defined', '“total”'],
    ['UnboundLocalError: cannot access local variable \'result\' where it is not associated with a value', '“result”'],
    ['TypeError: \'NoneType\' object is not callable', '不能作为函数调用'],
    ['TypeError: \'int\' object is not subscriptable', '不支持用方括号'],
    ['TypeError: \'NoneType\' object is not iterable', '不能被遍历'],
    ['TypeError: add() missing 1 required positional argument: \'b\'', '参数不正确'],
    ['RecursionError: maximum recursion depth exceeded', '终止条件'],
    ['UnicodeDecodeError: codec cannot decode byte', '真实编码'],
    ['UnicodeEncodeError: codec cannot encode character', 'UTF-8'],
    ['FileExistsError: file already exists', 'exist_ok=True'],
    ['IsADirectoryError: directory', '具体文件名'],
    ['NotADirectoryError: file', '目录层级'],
    ['EOFError: EOF when reading a line', '输入框'],
    ['StopIteration', 'next(iterator'],
    ['Traceback (most recent call last):\n  File "/tmp/main.py", line 1\nAssertionError', 'assert'],
    ['Traceback (most recent call last):\nKeyboardInterrupt', '运行被中断'],
    ['TimeoutError: waited too long', '等待输入'],
    ['RuntimeWarning: invalid value encountered', '警告'],
    ['ExceptionGroup: two errors', '逐项'],
])('explains %s with a useful Chinese hint', (error, hint) => {
    const explanation = explainPythonError(error);
    expect(explanation).toContain(hint);
    expect(explanation).not.toContain('中文解释');
});
it('explains the final exception instead of an earlier error in the chain',()=>{
    const error='ModuleNotFoundError: No module named \'earlier\'\n\nDuring handling of the above exception, another exception occurred:\n\nTraceback (most recent call last):\n  File "/tmp/main.py", line 4\nValueError: invalid literal for int() with base 10: \'bad\'';
    expect(explainPythonError(error)).toContain('具体值不合法');
    expect(explainPythonError(error)).not.toContain('找不到模块');
    expect(pythonErrorLine(error)).toBe(4);
});
it('handles infrastructure errors and unknown failures without inventing an exception type',()=>{
    expect(explainPythonError('Execution timed out')).toContain('超时');
    expect(explainPythonError('Output exceeds 5 MB limit')).toContain('输出限制');
    expect(explainPythonError('Read-only file system')).toContain('权限');
    expect(explainPythonError('custom failure')).toContain('上方原始错误');
});
