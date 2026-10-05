export function codeEnvironmentHelp(language: string, en = false): string {
    const kind = ({py:'python',cpp:'cpp','c++':'cpp',js:'javascript',ts:'typescript',htm:'html',shell:'bash',sh:'bash'} as Record<string,string>)[language] || language;
    const zh: Record<string,string> = {
        python:'Python：Python 3.12，运行在隔离 Docker 沙箱。支持 NumPy、pandas、SciPy、SymPy、Matplotlib（中文字体）等预装模块。input() 和 sys.stdin 可在面板中多次输入。',
        java:'Java：运行在隔离 Docker 沙箱，自动按公开类名生成同名 .java 文件，支持 package。使用 public static void main(String[] args) 入口；Scanner、BufferedReader 可在面板中交互输入。',
        c:'C：在隔离 Docker 沙箱中用 GCC 编译运行。scanf、getchar、fgets 等标准输入会显示输入框；输入数据需与读取类型匹配。',
        cpp:'C++：在隔离 Docker 沙箱中用 G++ 编译运行，支持 C++17。cin、getline 等标准输入会显示输入框；可连续提交多次输入。',
        bash:'Bash/Shell：bash、shell 使用 Bash；sh 使用 POSIX Shell。脚本在隔离 Docker 沙箱执行，read 等命令可交互输入；每次运行是独立进程。',
        javascript:'JavaScript：在浏览器 Worker 中执行，支持 console 和返回值；不能直接访问页面 DOM 或沙箱上传文件。',
        typescript:'TypeScript：当前按 JavaScript 语法在浏览器 Worker 中执行，请去除类型注解；不能直接访问页面 DOM 或沙箱上传文件。',
        html:'HTML：在隔离 iframe 中预览页面；可以使用 HTML、CSS 和页面脚本。',
    };
    const english: Record<string,string> = {
        python:'Python: Python 3.12 in an isolated Docker sandbox with NumPy, pandas, SciPy, SymPy and Matplotlib (Chinese fonts). input() and sys.stdin support repeated input in this panel.',
        java:'Java: isolated Docker execution; filenames automatically match public class names and package declarations are supported. Use public static void main(String[] args). Scanner and BufferedReader support interactive input.',
        c:'C: compiled with GCC in an isolated Docker sandbox. scanf, getchar and fgets use panel input; submit values matching the expected types.',
        cpp:'C++: compiled with G++ (C++17) in an isolated Docker sandbox. cin and getline support repeated panel input.',
        bash:'Bash/Shell: bash/shell use Bash; sh uses POSIX Shell. Scripts run in an isolated Docker sandbox and read supports panel input. Each execution is a separate process.',
        javascript:'JavaScript: runs in a browser Worker. Page DOM and sandbox uploaded files are unavailable.',
        typescript:'TypeScript: runs as JavaScript in a browser Worker; remove type annotations. Page DOM and sandbox uploaded files are unavailable.',
        html:'HTML: previewed in an isolated iframe with HTML, CSS and page scripts.',
    };
    const sandbox = ['python','java','c','cpp','bash'].includes(kind);
    return [(en ? english : zh)[kind] || (en?'Select a code language to see its execution help.':'选择代码块语言后显示对应运行帮助。'),
        sandbox ? (en?'Files: upload into /tmp/home, use relative paths, and download generated results. No external network or host files. Code limit: 64 KB; execution: 20 seconds; each input wait: 2 minutes; session: 5 minutes.':'文件：上传到 /tmp/home 用户目录，可用相对路径读取；生成文件可下载。沙箱禁止联网，不能访问宿主机文件。代码最多 64 KB，计算限时 20 秒，每次输入等待最多 2 分钟，运行会话最多 5 分钟。') : '',
        en?'Supported languages: Python, Java, C, C++, Bash/Shell, JavaScript, TypeScript, HTML.':'支持的语言：Python、Java、C、C++、Bash/Shell、JavaScript、TypeScript、HTML。'].filter(Boolean).join('\n\n');
}
