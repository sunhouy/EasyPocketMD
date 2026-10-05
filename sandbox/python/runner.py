"""Container entrypoint: execute one stdin request and return bounded text/PNG JSON."""
import builtins
import base64
import contextlib
import io
import json
import os
from pathlib import Path
import stat
import re
import subprocess
import tempfile
import resource
import pty
import select
import signal
import termios
import time
import sys
import traceback

MAX_TEXT = 64 * 1024
MAX_IMAGES = 8
MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024
MAX_FILE_BYTES = 4 * 1024 * 1024


def collect_files(root_dir='/tmp/output', max_bytes=MAX_FILE_BYTES, max_count=16, include_hidden=False):
    files, total, scanned, warning = [], 0, 0, ''
    for root, directories, names in os.walk(root_dir, followlinks=False):
        scanned += 1 + len(directories)
        if scanned > 1024:
            return files, '输出文件过多，仅返回前面符合限制的文件。'
        directories[:] = sorted(d for d in directories if (include_hidden or not d.startswith('.')) and d != '__pycache__')
        if len(Path(root).relative_to(root_dir).parts) >= 8:
            directories[:] = []
        for name in sorted(names):
            scanned += 1
            if scanned > 1024:
                return files, '输出文件过多，仅返回前面符合限制的文件。'
            path = Path(root) / name
            relative = path.relative_to(root_dir).as_posix()
            if (not include_hidden and name.startswith('.')) or len(relative) > 512 or any(ord(c) < 32 for c in relative) or '\\' in relative:
                continue
            fd = None
            try:
                fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                info = os.fstat(fd)
                if not stat.S_ISREG(info.st_mode):
                    continue
                if len(files) >= max_count or total + info.st_size > max_bytes:
                    warning = f'文件最多返回 {max_count} 个、总大小 {max_bytes // (1024 * 1024)} MB；部分文件超过限制，未返回。'
                    continue
                with os.fdopen(fd, 'rb') as stream:
                    fd = None
                    raw = stream.read(max_bytes - total + 1)
                if total + len(raw) > max_bytes:
                    warning = '文件总大小超过限制，部分文件未返回。'
                    continue
                total += len(raw)
                files.append({'name': relative, 'data': base64.b64encode(raw).decode('ascii')})
            except OSError:
                continue
            finally:
                if fd is not None:
                    os.close(fd)
    return files, warning



def java_entry(code):
    # Mask comments and literals while preserving line numbers/braces in real code.
    masked = re.sub(r"/\*.*?\*/|//[^\n]*|\"\"\".*?\"\"\"|\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'",
                    lambda m: ''.join('\n' if c == '\n' else ' ' for c in m[0]), code, flags=re.S)
    declarations = []
    for match in re.finditer(r'\b(?:(public)\s+)?(?:(?:final|abstract|sealed|non-sealed|strictfp)\s+)*(?:class|record|enum|interface)\s+([A-Za-z_$][\w$]*)', masked):
        prefix = masked[:match.start()]
        if prefix.count('{') == prefix.count('}'):
            declarations.append((bool(match[1]), match[2]))
    if not declarations:
        raise ValueError('Java 代码需要声明一个包含 public static void main(String[] args) 的类。')
    name = next((name for public, name in declarations if public), declarations[0][1])
    package = re.search(r'^\s*package\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*;', masked, re.M)
    qualified = re.sub(r'\s+', '', package[1]) + '.' + name if package else name
    return name, qualified


def native_limits():
    # Bound regular output files before subprocesses write into the tmpfs.
    resource.setrlimit(resource.RLIMIT_FSIZE, (8 * 1024 * 1024, 8 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (20, 20))


def native_command(args):
    # Regular files keep subprocess output bounded in memory; the container owns
    # process/time/memory/network isolation and kills all children on timeout.
    with tempfile.TemporaryFile(dir='/tmp') as captured:
        completed = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=captured, stderr=subprocess.STDOUT,
                                   timeout=18, preexec_fn=native_limits, env={**os.environ, 'LC_ALL':'C.UTF-8'})
        captured.seek(0)
        raw = captured.read(MAX_TEXT + 1)
        return completed.returncode, raw[:MAX_TEXT].decode('utf-8', errors='replace'), len(raw) > MAX_TEXT


def stdin_waiting(pid):
    """Linux exposes blocked read(0) for the process/JVM thread reading stdin."""
    observed = False
    for task in Path(f'/proc/{pid}/task').glob('*'):
        try:
            fields = (task / 'syscall').read_text().split()
            observed = True
            if len(fields) > 1 and fields[0] == '0' and int(fields[1], 0) == 0:
                return True, True
        except (OSError, ValueError):
            continue
    return False, observed


def interactive_command(args, wire_in, wire_out):
    master, slave = pty.openpty()
    settings = termios.tcgetattr(slave)
    settings[3] &= ~(termios.ECHO | termios.ICANON)
    settings[6][termios.VMIN] = 1
    settings[6][termios.VTIME] = 0
    termios.tcsetattr(slave, termios.TCSANOW, settings)
    child = subprocess.Popen(args, stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
                             preexec_fn=native_limits, env={**os.environ, 'LC_ALL':'C.UTF-8'})
    os.close(slave)
    os.set_blocking(master, False)
    captured = bytearray()
    truncated, waiting, calls = False, False, 0
    remaining, last, quiet, cooldown = 18.0, time.monotonic(), time.monotonic(), 0.0
    answer = bytearray()
    try:
        while True:
            now = time.monotonic()
            if not waiting:
                remaining -= now - last
                if remaining <= 0:
                    raise subprocess.TimeoutExpired(args, 18)
            last = now
            ready, _, _ = select.select([master, *([wire_in.fileno()] if waiting else [])], [], [], 0.04)
            if master in ready:
                try:
                    chunk = os.read(master, 8192)
                except OSError:
                    chunk = b''
                if chunk:
                    quiet = now
                    room = MAX_TEXT - len(captured)
                    captured.extend(chunk[:max(0, room)])
                    truncated |= len(chunk) > room
            status = child.poll()
            if status is not None:
                # Drain the terminal after exit, before releasing its descriptors.
                while select.select([master], [], [], 0)[0]:
                    try:
                        chunk = os.read(master, 8192)
                    except OSError:
                        break
                    if not chunk:
                        break
                    room = MAX_TEXT - len(captured)
                    captured.extend(chunk[:max(0, room)])
                    truncated |= len(chunk) > room
                return status, captured.decode('utf-8', errors='replace').replace('\r\n', '\n'), truncated
            if waiting and wire_in.fileno() in ready:
                chunk = os.read(wire_in.fileno(), 131072)
                if not chunk:
                    raise EOFError('Input cancelled')
                answer.extend(chunk)
                if len(answer) > 131072:
                    raise ValueError('Input exceeds limit')
                if b'\n' in answer:
                    line, _, rest = answer.partition(b'\n')
                    data = json.loads(line)
                    if data.get('cancel'):
                        raise EOFError('Input cancelled')
                    value = str(data.get('value', '')).encode('utf-8') + b'\n'
                    if len(value) > 65537:
                        raise ValueError('Input exceeds 64 KB limit')
                    view = memoryview(value)
                    deadline = time.monotonic() + remaining
                    while view and child.poll() is None:
                        if time.monotonic() >= deadline:
                            raise subprocess.TimeoutExpired(args, 18)
                        try:
                            sent = os.write(master, view)
                            view = view[sent:]
                        except BlockingIOError:
                            select.select([], [master], [], 0.04)
                        except OSError:
                            if child.poll() is not None:
                                break
                            raise
                    answer = bytearray(rest)
                    waiting, cooldown, last = False, time.monotonic() + 0.1, time.monotonic()
            if not waiting and now >= cooldown:
                blocked, observable = stdin_waiting(child.pid)
                # If /proc is restricted, offer input after quiet output while
                # continuing to watch completion; a finished program never waits.
                if blocked or (not observable and now - quiet > 1.0):
                    calls += 1
                    if calls > 20:
                        raise RuntimeError('最多支持 20 次交互输入')
                    text = captured.decode('utf-8', errors='replace').replace('\r\n', '\n')
                    prompt = text.rsplit('\n', 1)[-1][-4096:] or '请输入程序需要的数据：'
                    wire_out.write(json.dumps({'type':'input', 'prompt':prompt, 'output':text}) + '\n')
                    wire_out.flush()
                    waiting = True
    finally:
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait()
        os.close(master)


def run_native(request, wires=None):
    language = request['language']
    if language not in ('java', 'c', 'cpp', 'c++', 'bash', 'shell', 'sh'):
        raise ValueError('不支持的沙箱语言')
    root = Path(tempfile.mkdtemp(prefix='epmd-source-', dir='/runner-build' if language in ('c','cpp','c++') else '/tmp'))
    try:
        if language == 'java':
            name, qualified = java_entry(request['code'])
            source = root / (name + '.java')
            source.write_text(request['code'], encoding='utf-8')
            classes = root / 'classes'
            classes.mkdir()
            vm = ['-XX:ActiveProcessorCount=1', '-XX:+UseSerialGC', '-Xmx96m', '-XX:MaxMetaspaceSize=64m', '-XX:ReservedCodeCacheSize=32m', '-Xss512k', '-Djava.io.tmpdir=/tmp']
            status, output, truncated = native_command(['javac', *['-J' + option for option in vm], '-encoding', 'UTF-8', '-d', str(classes), str(source)])
            if status:
                line = re.search(re.escape(str(source)) + r':(\d+):', output)
                return {'success':False, 'output':'', 'error':output, 'errorLine':int(line[1]) if line else None, 'phase':'compile'}
            command = ['java', *vm, '-cp', str(classes), qualified]
        elif language in ('c', 'cpp', 'c++'):
            cpp = language != 'c'
            source = root / ('main.cpp' if cpp else 'main.c')
            source.write_text(request['code'], encoding='utf-8')
            executable = root / 'main'
            status, output, truncated = native_command(['g++' if cpp else 'gcc', '-std=c++17' if cpp else '-std=c17', '-O1', str(source), '-o', str(executable), '-lm'])
            if status:
                line = re.search(re.escape(str(source)) + r':(\d+):', output)
                return {'success':False, 'output':'', 'error':output, 'errorLine':int(line[1]) if line else None, 'phase':'compile'}
            command = [str(executable)]
        else:
            source = root / 'main.sh'
            source.write_text(request['code'], encoding='utf-8')
            command = ['/bin/sh', str(source)] if language == 'sh' else ['bash', '--noprofile', '--norc', str(source)]
        status, output, truncated = interactive_command(command, *wires) if request.get('interactive') and wires else native_command(command)
        warning = '\n输出超过 64 KB，已截断。' if truncated else ''
        result = {'success':status == 0, 'output':output + warning}
        if status:
            result['error'] = f'程序退出码：{status}\n' + output
            if language == 'java':
                line = re.search(re.escape(name) + r'\.java:(\d+)\)', output)
            else:
                line = re.search(re.escape(str(source)) + r':(?: line)? (\d+):', output)
            if line:
                result['errorLine'] = int(line[1])
        return result
    except subprocess.TimeoutExpired:
        return {'success':False, 'output':'', 'error':'沙箱运行超时，请检查死循环、等待输入或计算量过大。'}
    finally:
        import shutil
        shutil.rmtree(root, ignore_errors=True)


class Output(io.StringIO):
    def write(self, value):
        remaining = MAX_TEXT - self.tell()
        if remaining > 0:
            super().write(value[:remaining])
        return len(value)


def install_chinese_font_fallback(matplotlib):
    """Resolve unavailable font names and add CJK glyph fallback at render time.

    User rcParams, styles and per-text font properties can override startup
    defaults. Resolve their families lazily so those overrides remain supported.
    This affects only this disposable Python process, never the document source.
    """
    from matplotlib import font_manager

    manager = font_manager.fontManager
    available = {entry.name.casefold(): entry.name for entry in manager.ttflist}
    preferred = ('Noto Sans CJK SC', 'Noto Sans CJK JP', 'Noto Sans CJK TC')
    fallback = next((available[name.casefold()] for name in preferred
                     if name.casefold() in available), None)
    if fallback is None:
        raise RuntimeError('Chinese fonts missing from sandbox; rebuild with fonts-noto-cjk')
    original_get_family = font_manager.FontProperties.get_family
    generic = {'sans': 'sans-serif', 'sans serif': 'sans-serif',
               'sans-serif': 'sans-serif', 'serif': 'serif',
               'monospace': 'monospace', 'cursive': 'cursive', 'fantasy': 'fantasy'}
    font_count = len(manager.ttflist)

    def get_family(properties):
        nonlocal available, font_count
        # Respect fonts users register explicitly with font_manager.addfont().
        if len(manager.ttflist) != font_count:
            available = {entry.name.casefold(): entry.name for entry in manager.ttflist}
            font_count = len(manager.ttflist)
        resolved = []
        for name in original_get_family(properties):
            key = name.casefold()
            candidates = matplotlib.rcParams['font.' + generic[key]] if key in generic else [name]
            for candidate in candidates:
                family = available.get(candidate.casefold(), fallback)
                if family not in resolved:
                    resolved.append(family)
        # Keep available Latin fonts, and supply Chinese glyphs from Noto CJK.
        if fallback not in resolved:
            resolved.append(fallback)
        return resolved

    font_manager.FontProperties.get_family = get_family
    matplotlib.rcParams['font.sans-serif'] = [fallback, 'DejaVu Sans']
    matplotlib.rcParams['axes.unicode_minus'] = False


def main():
    wire_in, wire_out = sys.stdin, sys.stdout
    request = json.loads(wire_in.readline(12 * 1024 * 1024))
    workspace = request.get('workspace') is True
    home = Path('/tmp/home')
    if workspace:
        home.mkdir(exist_ok=True)
        Path('/tmp/output').symlink_to(home, target_is_directory=True)
        os.environ['HOME'] = str(home)
        directories = request.get('directories', [])
        if not isinstance(directories, list) or len(directories) > 128:
            raise ValueError('Invalid directories')
        for directory in directories:
            target = (home / directory).resolve()
            if not target.is_relative_to(home):
                raise ValueError('Invalid directory')
            target.mkdir(parents=True, exist_ok=True)
    uploads = Path('/tmp/uploads')
    uploads.mkdir(exist_ok=True)
    total_upload = 0
    if not isinstance(request.get('files', []), list) or len(request.get('files', [])) > (64 if workspace else 8):
        raise ValueError('Invalid uploaded files')
    for file in request.get('files', []):
        name = file['name']
        if not isinstance(name, str) or not name or name in ('.', '..') or (not workspace and '/' in name) or '\\' in name or len(name) > 512 or name.startswith('/') or any(p in ('.', '..') for p in name.split('/')):
            raise ValueError('Invalid uploaded filename')
        data = base64.b64decode(file['data'], validate=True)
        total_upload += len(data)
        if total_upload > 8 * 1024 * 1024:
            raise ValueError('Uploaded files exceed 8 MB')
        destination = uploads / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        if workspace:
            destination = home / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
    Path('/tmp/output').mkdir(exist_ok=True)
    os.chdir(home if workspace else '/tmp/output')
    if workspace and request.get('cwd'):
        target = (home / request['cwd']).resolve()
        if target.is_relative_to(home) and target.is_dir():
            os.chdir(target)
    output = Output()
    if request.get('interactive') or request.get('language', 'python') != 'python':
        wire_out.write(json.dumps({'type':'ready', 'protocol':2, 'files':True, 'workspace':True, 'languages':['python','java','c','cpp','c++','bash','shell','sh'], 'interactiveLanguages':['java','c','cpp','c++','bash','shell','sh']}) + '\n')
        wire_out.flush()
        calls = 0
        def ask(prompt=''):
            nonlocal calls
            calls += 1
            if calls > 20:
                raise RuntimeError('Too many input requests (maximum 20)')
            wire_out.write(json.dumps({'type':'input', 'prompt':str(prompt)[:4096], 'output':output.getvalue()}) + '\n')
            wire_out.flush()
            message = wire_in.readline(128 * 1024)
            if not message:
                raise EOFError('Input cancelled')
            data = json.loads(message)
            if data.get('cancel'):
                raise EOFError('Input cancelled')
            value = str(data.get('value', ''))
            output.write(str(prompt))
            return value
        builtins.input = ask
        class InteractiveStdin(io.TextIOBase):
            def readable(self):
                return True
            def readline(self, size=-1):
                value = ask() + '\n'
                return value if size < 0 else value[:size]
        sys.stdin = InteractiveStdin()
    images = []
    result = {"success": True}
    with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
        try:
            if request.get('language', 'python') != 'python':
                native = run_native(request, (wire_in, wire_out))
                output.write(native.pop('output', ''))
                result.update(native)
            else:
                import matplotlib
                matplotlib.use('Agg', force=True)
                import matplotlib.pyplot as plt
                install_chinese_font_fallback(matplotlib)
                plt.rcParams['figure.max_open_warning'] = MAX_IMAGES
                total = 0
                captured = set()

                def capture():
                    nonlocal total
                    for number in plt.get_fignums():
                        fig = plt.figure(number)
                        if fig in captured:
                            continue
                        if len(images) >= MAX_IMAGES:
                            raise RuntimeError('Too many figures (maximum 8)')
                        data = io.BytesIO()
                        fig.savefig(data, format='png', dpi=100, bbox_inches='tight')
                        raw = data.getvalue()
                        if len(raw) > MAX_IMAGE_BYTES or total + len(raw) > MAX_TOTAL_IMAGE_BYTES:
                            raise RuntimeError('Figure output exceeds 2 MB limit')
                        images.append({"mime": "image/png", "data": base64.b64encode(raw).decode('ascii')})
                        total += len(raw)
                        captured.add(fig)

                # show() captures before users close figures; remaining figures are captured at exit.
                def show(*args, **kwargs):
                    capture()
                    plt.close('all')
                plt.show = show
                scope = {"__name__": "__main__", "__file__": "/tmp/main.py"}
                try:
                    exec(compile(request['code'], '/tmp/main.py', 'exec'), scope, scope)
                finally:
                    capture()
                    plt.close('all')
        except BaseException:
            error = sys.exc_info()[1]
            frames = traceback.extract_tb(error.__traceback__)
            user_lines = [frame.lineno for frame in frames if frame.filename == '/tmp/main.py']
            line = error.lineno if isinstance(error, SyntaxError) and error.filename == '/tmp/main.py' else (user_lines[-1] if user_lines else None)
            result = {"success": False, "phase": "runtime", "error": traceback.format_exc(limit=12)[-MAX_TEXT:], "errorLine": line}
    files, warning = collect_files(str(home), 8 * 1024 * 1024, 64, True) if workspace else collect_files()
    directories = []
    if workspace:
        for root, children, _ in os.walk(home, followlinks=False):
            children[:] = [d for d in sorted(children) if not (Path(root) / d).is_symlink()]
            for child in children:
                directories.append((Path(root) / child).relative_to(home).as_posix())
            if len(directories) > 128:
                directories = directories[:128]
                warning = '文件夹数量超过 128，部分文件夹未保留。'
                break
    try:
        cwd = os.getcwd() if workspace else None
    except OSError:
        cwd = '/tmp/home'
    result.update(output=output.getvalue(), images=images, files=files, fileWarning=warning, cwd=cwd, directories=directories)
    wire_out.write(json.dumps(dict(type='result', **result)) + '\n')
    wire_out.flush()


if __name__ == '__main__':
    main()
