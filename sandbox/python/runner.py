"""Container entrypoint: execute one stdin request and return bounded text/PNG JSON."""
import base64
import contextlib
import io
import json
import sys
import traceback

MAX_TEXT = 64 * 1024
MAX_IMAGES = 8
MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024


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
    request = json.loads(sys.stdin.read(128 * 1024))
    output = Output()
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
            result = {"success": False, "phase": "runtime", "error": traceback.format_exc(limit=12)[-MAX_TEXT:]}
    result.update(output=output.getvalue(), images=images)
    sys.stdout.write(json.dumps(result))


if __name__ == '__main__':
    main()
