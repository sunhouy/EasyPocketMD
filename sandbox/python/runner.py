"""Container entrypoint: execute one stdin request and return bounded text/PNG JSON."""
import builtins
import base64
import contextlib
import io
import json
import os
from pathlib import Path
import stat
import sys
import traceback

MAX_TEXT = 64 * 1024
MAX_IMAGES = 8
MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024
MAX_FILE_BYTES = 4 * 1024 * 1024


def collect_files():
    files, total, scanned, warning = [], 0, 0, ''
    for root, directories, names in os.walk('/tmp/output', followlinks=False):
        scanned += 1 + len(directories)
        if scanned > 1024:
            return files, '输出文件过多，仅返回前面符合限制的文件。'
        directories[:] = sorted(d for d in directories if not d.startswith('.') and d != '__pycache__')
        if len(Path(root).relative_to('/tmp/output').parts) >= 8:
            directories[:] = []
        for name in sorted(names):
            scanned += 1
            if scanned > 1024:
                return files, '输出文件过多，仅返回前面符合限制的文件。'
            path = Path(root) / name
            relative = path.relative_to('/tmp/output').as_posix()
            if name.startswith('.') or len(relative) > 512 or any(ord(c) < 32 for c in relative) or '\\' in relative:
                continue
            fd = None
            try:
                fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                info = os.fstat(fd)
                if not stat.S_ISREG(info.st_mode):
                    continue
                if len(files) >= 16 or total + info.st_size > MAX_FILE_BYTES:
                    warning = '输出文件最多返回 16 个、总大小 4 MB；部分文件超过限制，未返回。'
                    continue
                with os.fdopen(fd, 'rb') as stream:
                    fd = None
                    raw = stream.read(MAX_FILE_BYTES - total + 1)
                if total + len(raw) > MAX_FILE_BYTES:
                    warning = '输出文件总大小超过 4 MB，部分文件未返回。'
                    continue
                total += len(raw)
                files.append({'name': relative, 'data': base64.b64encode(raw).decode('ascii')})
            except OSError:
                continue
            finally:
                if fd is not None:
                    os.close(fd)
    return files, warning


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
    uploads = Path('/tmp/uploads')
    uploads.mkdir(exist_ok=True)
    total_upload = 0
    if not isinstance(request.get('files', []), list) or len(request.get('files', [])) > 8:
        raise ValueError('Invalid uploaded files')
    for file in request.get('files', []):
        name = file['name']
        if not isinstance(name, str) or not name or name in ('.', '..') or '/' in name or '\\' in name or len(name) > 150:
            raise ValueError('Invalid uploaded filename')
        data = base64.b64decode(file['data'], validate=True)
        total_upload += len(data)
        if total_upload > 8 * 1024 * 1024:
            raise ValueError('Uploaded files exceed 8 MB')
        (uploads / name).write_bytes(data)
    Path('/tmp/output').mkdir(exist_ok=True)
    os.chdir('/tmp/output')
    output = Output()
    if request.get('interactive'):
        wire_out.write(json.dumps({'type':'ready', 'protocol':2, 'files':True}) + '\n')
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
    files, warning = collect_files()
    result.update(output=output.getvalue(), images=images, files=files, fileWarning=warning)
    wire_out.write(json.dumps(dict(type='result', **result)) + '\n')
    wire_out.flush()


if __name__ == '__main__':
    main()
