/** Preserve the original traceback and explain its final exception in Chinese. */
const pythonExplanations: Record<string, string> = {
    ModuleNotFoundError: '找不到需要导入的模块。请检查模块名称和拼写；包名与导入名可能不同。当前沙箱无法联网安装依赖，可改用运行环境已有的模块。',
    ImportError: '模块导入失败。请检查要导入的函数或类是否存在、依赖版本是否支持，以及文件名是否与模块重名或存在循环导入。',
    TabError: '缩进混用了制表符和空格。请将同一代码块的缩进统一为四个空格，特别检查复制粘贴的代码。',
    IndentationError: '缩进层级不正确。if、for、while、def、class、try 等语句后的代码需要缩进；同一层级的语句应对齐。',
    SyntaxError: '代码语法不完整或不符合 Python 规则。请检查报错行及上一行的括号、引号、冒号和逗号，留意中文标点，以及当前 Python 版本是否支持该写法。',
    UnboundLocalError: '局部变量在赋值前被使用。请检查是否只有某些分支给它赋值；函数内赋值会将同名变量视为局部变量，必要时传入参数或正确声明 global、nonlocal。',
    NameError: '变量、函数或类的名称未定义。请检查拼写和大小写，确认使用前已赋值或导入，并检查定义所在的作用域。',
    TypeError: '对象类型或函数参数不符合要求。请检查参数数量、关键字名称及数据类型；字符串与数字不能直接相加，None 也不能当作列表或数字使用。',
    ValueError: '参数类型可接受，但具体值不合法。请检查空字符串、数字转换、解包数量、数组形状，以及函数允许的取值范围。',
    IndexError: '索引超出列表、元组或数组范围。长度为 n 时，正常索引应在 0 到 n−1 之间；请先检查是否为空，以及循环的边界。',
    KeyError: '字典中不存在这个键，或表格没有对应列。请检查名称、大小写和空格；访问前可用 in 判断，或使用 dict.get() 提供默认值。',
    AttributeError: '对象没有这个属性或方法。请检查对象实际类型和方法拼写；若对象是 None，请检查函数是否缺少 return，或查找操作是否失败。',
    ZeroDivisionError: '除数为零，除法、整除或取余无法完成。请在计算前检查分母，留意空数据统计出的数量或计算得到的零值。',
    OverflowError: '数值超出该运算或目标类型允许的范围。请检查指数、乘积和类型转换，缩小数值或改用适合大数的计算方法。',
    FloatingPointError: '浮点运算出现无效结果。请检查除零、数值溢出、NaN 和无穷大，以及数值库设置的错误处理方式。',
    ArithmeticError: '算术运算失败。请检查参与计算的数值、分母及数值范围，并查看原始错误中的具体运算原因。',
    AssertionError: 'assert 检查的条件不成立。请对照预期结果检查输入和计算过程；不要只删除断言，应先确认不满足条件的原因。',
    EOFError: 'input() 等待读取内容时，输入已经结束。请在输入框提交所需数据，并检查代码是否要求了比实际提供次数更多的输入。',
    FileNotFoundError: '找不到指定文件或路径。请先通过运行面板上传文件，核对文件名、大小写和相对路径；电脑上的绝对路径不能直接在沙箱中使用。',
    FileExistsError: '要创建的文件或目录已经存在。请更换名称；创建目录时可在确认允许复用后使用 exist_ok=True，写入文件时检查打开模式。',
    IsADirectoryError: '代码把目录当作普通文件来读取或写入。请补上具体文件名；需要列出目录内容时使用 os.listdir() 或 pathlib。',
    NotADirectoryError: '路径中的某一部分是普通文件，无法作为目录继续访问。请检查目录层级和文件名是否写反。',
    PermissionError: '没有执行这项文件操作的权限。请使用沙箱允许写入的临时目录，检查目标是否只读；需要保留的结果请在运行结束后下载。',
    BlockingIOError: '非阻塞读写当前暂时不能完成。请等待资源可用后重试，检查是否正确处理非阻塞流，避免无限忙等待。',
    BrokenPipeError: '接收数据的一端已经关闭，无法继续写入。请检查子进程、管道或输出流是否提前结束。',
    ChildProcessError: '没有可等待或操作的子进程。请检查进程是否已经退出或被回收，以及保存的进程标识是否有效。',
    ConnectionAbortedError: '连接在传输过程中被中止。Python 沙箱禁止访问外部网络；请检查代码是否依赖网络请求，改为先上传需要的数据。',
    ConnectionRefusedError: '目标拒绝建立连接。请检查目标地址和服务是否存在；Python 沙箱不能连接外部 API 或下载地址。',
    ConnectionResetError: '连接被对端重置。请检查服务或子进程是否提前退出；依赖外部网络的数据应先下载再上传到沙箱。',
    ConnectionError: '网络连接失败。Python 沙箱禁止联网，不能访问外部 API 或下载文件；请先上传数据，再在代码中读取。',
    InterruptedError: '系统操作在完成前被中断。请检查程序是否被取消或收到信号；确认操作可以安全重复后再重试。',
    ProcessLookupError: '找不到指定进程。进程可能已经退出，请检查进程标识和操作时机。',
    TimeoutError: '操作等待超时。请检查死循环、计算量过大、等待输入或网络请求；可减少数据量、拆分任务并确认需要的输入已提交。',
    OSError: '系统或文件操作失败。请查看原始错误中的路径和错误码，检查文件是否存在、目录类型、权限及可用空间。',
    MemoryError: '运行所需内存超过可用额度。请减少一次加载的数据，使用分块读取或生成器，避免反复复制大列表和高分辨率图片。',
    RecursionError: '递归调用过深。请检查是否缺少终止条件，或函数是否意外调用自己；可改用循环处理，避免盲目提高递归上限。',
    NotImplementedError: '当前方法尚未实现。请使用具体实现类，或为自定义类补充该方法；它与表示不支持某运算的 NotImplemented 常量不同。',
    RuntimeError: '运行状态不符合操作要求。请查看原始提示，检查资源是否已经关闭、对象是否在遍历中被修改，以及异步操作的调用顺序。',
    ReferenceError: '弱引用指向的对象已经被释放。请检查对象生命周期，必要时在使用期间保留有效的强引用。',
    BufferError: '缓冲区操作无法完成。请检查内存视图是否仍在使用；释放 memoryview 后再调整底层缓冲区大小。',
    LookupError: '查找的键或索引无效。请检查字典键、序列范围，以及字符编码名称是否正确。',
    UnicodeDecodeError: '字节数据无法按指定编码解码为文字。请核对文件真实编码，尝试正确的 UTF-8、GBK 等编码；不要未经确认就忽略错误，以免丢失文字。',
    UnicodeEncodeError: '文字中存在目标编码无法表示的字符。请优先使用 UTF-8，并检查写入文件或输出流时指定的编码。',
    UnicodeTranslateError: '字符转换失败。请检查转换规则是否覆盖原文中的字符，以及替换内容是否有效。',
    UnicodeError: '文字编码或字符转换失败。请确认输入和输出使用的编码一致，区分字符串与字节数据。',
    StopIteration: '迭代器已经没有下一个元素。调用 next() 前可检查数据，或用 next(iterator, 默认值) 处理结束情况。',
    StopAsyncIteration: '异步迭代器已经结束。请正确处理异步遍历的结束条件，避免在结束后继续取值。',
    ExceptionGroup: '多个操作同时产生了异常。请逐项查看原始回溯中的子异常；使用 except* 时按异常类型分别处理。',
    BaseExceptionGroup: '运行中出现了一组异常，可能包含中断或退出信号。请逐项检查子异常，不要将所有退出信号当作普通错误忽略。',
    KeyboardInterrupt: '运行被中断，通常是用户取消或程序收到中断信号。请确认是否需要重新运行，并检查是否有耗时任务或死循环。',
    SystemExit: '程序主动请求退出。请检查 sys.exit() 的退出码；非零退出码一般表示代码希望报告失败。',
    GeneratorExit: '生成器或协程正在关闭。请检查关闭时的清理逻辑，避免在收到关闭信号后继续产生数据。',
    SystemError: '解释器或扩展模块报告了内部错误。请尝试缩小到最小示例，检查是否与所用扩展模块或运行环境兼容性有关。',
};

export function explainPythonError(error: unknown): string {
    const text = String(error ?? '');
    // Exception chains contain earlier, handled failures. The final exception
    // line identifies the failure that actually stopped this execution.
    const frames = [...text.matchAll(/^[ \t]*([A-Za-z_][\w.]*)(?::[ \t]*(.*))?[ \t]*$/gm)];
    const final = frames.filter(frame => /(?:Error|Exception|Interrupt|Exit|Iteration|Group|Warning)$/.test(frame[1])).at(-1);
    const type = final?.[1].split('.').at(-1);
    const detail = final?.[2]?.trim() || '';
    if (type === 'ModuleNotFoundError') {
        const module = detail.match(/No module named ['"]([^'"]+)['"]/)?.[1];
        if (module) return `找不到模块“${module}”。请检查导入名称和拼写；当前沙箱无法联网安装依赖，可改用运行环境已有的模块。`;
    }
    if (type === 'NameError' || type === 'UnboundLocalError') {
        const name = detail.match(/(?:name|variable) ['"]([^'"]+)['"]/)?.[1];
        if (name) return `“${name}”在此处尚未定义或赋值。` + pythonExplanations[type];
    }
    if (type === 'TypeError') {
        if (/not callable/.test(detail)) return '这个对象不能作为函数调用。请检查是否给数字、字符串或 None 加了调用括号，以及是否用变量覆盖了原来的函数名。';
        if (/not subscriptable/.test(detail)) return '这个对象不支持用方括号取值。请检查对象是否为 None、数字或函数，并确认函数调用是否返回了预期的列表或字典。';
        if (/not iterable/.test(detail)) return '这个对象不能被遍历或解包。请检查它是否为 None 或单个数字；for、list() 和多变量赋值需要可迭代的数据。';
        if (/unexpected keyword argument|positional arguments?|required positional argument/.test(detail)) return '函数调用的参数不正确。请核对函数定义中的参数数量、名称和默认值；实例方法还应检查 self 是否正确声明。';
    }
    if (type && pythonExplanations[type]) return pythonExplanations[type];
    if (type?.endsWith('Warning')) return '运行环境发出了警告。请查看原始内容，检查弃用功能、资源释放、数据类型和编码；若配置为将警告视为异常，警告会中止运行。';
    // Infrastructure failures do not necessarily have a Python exception name.
    if (/timeout|timed out|超时/i.test(text)) return pythonExplanations.TimeoutError;
    if (/Read-only file system/i.test(text)) return pythonExplanations.PermissionError;
    if (/Network is unreachable|Name or service not known|URLError/.test(text)) return pythonExplanations.ConnectionError;
    if (/exceeds.*(?:MB|limit)|超过.*(?:内存|输出|限制)/i.test(text)) return '运行结果超过内存或输出限制。请减少数据量和重复打印，降低图片数量或分辨率。';
    // Some callers only provide an exception name, without a traceback/message.
    if (pythonExplanations[text.trim()]) return pythonExplanations[text.trim()];
    return '运行未能完成。请根据上方原始错误检查代码和输入数据；若提供了行号，报错位置已在下方及原代码中标出。';
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
