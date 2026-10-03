/** Preserve the Python traceback, and add actionable Chinese explanations. */
export function explainPythonError(error: unknown): string {
    const text = String(error || '');
    const explanations: Array<[RegExp, string]> = [
        [/ModuleNotFoundError/, '未安装所需模块。请将对应包加入 sandbox/python/requirements.txt，重新构建并部署沙箱镜像；运行时无法联网安装。'],
        [/ImportError/, '导入失败。请检查模块或函数名称、依赖版本，以及是否存在循环导入。'],
        [/IndentationError|TabError/, '缩进错误。请统一使用空格缩进，并检查 if、for、def 等语句下方的缩进层级。'],
        [/SyntaxError/, '语法错误。请检查标出的行及上一行的括号、引号、冒号和逗号是否完整。'],
        [/UnboundLocalError/, '局部变量在赋值前被使用。请先初始化变量，并检查函数内外的变量作用域。'],
        [/NameError/, '名称未定义。请检查变量或函数的拼写，并确认已赋值或导入。'],
        [/TypeError/, '类型或参数错误。请检查参数数量、参数名称，以及字符串、数字、列表等类型是否符合要求。'],
        [/ValueError/, '参数值不合法。请检查转换的数据、数组形状和函数允许的取值范围。'],
        [/IndexError/, '索引越界。列表或数组的索引必须在有效范围内，空列表不能取元素。'],
        [/KeyError/, '字典或表格中不存在该键/列。请检查名称，或先判断键是否存在。'],
        [/AttributeError/, '对象没有该属性或方法。请检查对象类型、方法拼写和依赖版本。'],
        [/ZeroDivisionError/, '除数为零。请在除法或取余前检查分母。'],
        [/FileNotFoundError/, '文件不存在。沙箱不能直接访问你电脑或服务器上的文件；请检查代码中使用的路径。'],
        [/PermissionError|Read-only file system/, '没有文件操作权限。沙箱只允许在临时目录 /tmp 写入文件，并且不会保留到下次运行。'],
        [/MemoryError|exceeds.*(?:MB|limit)/i, '超过沙箱内存或输出限制。请减少数据量、图片数量或图片分辨率。'],
        [/timeout|timed out|超时/i, '运行超时。请检查死循环、过大的计算量或等待网络的操作；Python 最长运行 20 秒。'],
        [/ConnectionError|Network is unreachable|Name or service not known|URLError/, '网络请求失败。Python 沙箱禁止联网，不能访问外部 API 或下载文件。'],
        [/OverflowError/, '计算结果超出允许范围。请缩小数值或调整计算方式。'],
        [/AssertionError/, '断言条件不成立。请检查 assert 后的条件及输入数据。'],
    ];
    return explanations.find(([pattern]) => pattern.test(text))?.[1] || '请根据上方原始错误检查代码和输入数据；如果提供了行号，报错行已在下方及原代码中标出。';
}

export function pythonErrorLine(error: unknown, structuredLine?: number): number | null {
    if (Number.isSafeInteger(structuredLine) && structuredLine > 0) return structuredLine;
    const text = String(error || '');
    const frames = [...text.matchAll(/File ["'](?:\/tmp\/main\.py|<string>|<stdin>)["'], line (\d+)/g)];
    if (frames.length) return Number(frames[frames.length - 1][1]);
    // Only use an unqualified line number when there are no library traceback frames.
    if (!/File ["']/.test(text)) {
        const match = text.match(/\bline\s+(\d+)\b/i);
        if (match) return Number(match[1]);
    }
    return null;
}
