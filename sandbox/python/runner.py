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
            plt.rcParams['font.sans-serif'] = ['Noto Sans CJK JP', 'DejaVu Sans']
            plt.rcParams['axes.unicode_minus'] = False
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
