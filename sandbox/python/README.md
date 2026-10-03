# Server Python sandbox

Run `bash scripts/setup-python-sandbox.sh` as the backend service user. On Debian/Ubuntu,
root deployment installs Docker if missing; on other systems install Docker first.
The service user needs Docker access. The deployment workflows build and smoke-test the
image before switching releases. `PYTHON_SANDBOX_IMAGE` overrides the default image tag
`easypocketmd-python:1`. No Python code is ever executed on the web server host.

Each request uses a fresh non-root container, no network or host mounts, read-only root,
64 MB ephemeral `/tmp`, 512 MB RAM without swap, one CPU, 64 processes, no capabilities,
and `no-new-privileges`. The API permits two concurrent executions, 64 KB source,
a 20 second wall deadline, 64 KB text, up to eight figures and 2 MB total PNG bytes.
Cancellation/timeouts forcibly remove the container before freeing its slot.
Docker is a host security boundary and needs regular updates; for a public multi-tenant
service a dedicated worker host with rootless Docker or a stronger container runtime is recommended.

Installed libraries: NumPy, pandas, SciPy, SymPy, scikit-learn, seaborn, matplotlib,
Pillow, openpyxl; Noto CJK fonts support Chinese figure labels. Code cannot install
packages or access remote files. Change `requirements.txt` and rebuild to add libraries.

`POST /api/code-runner/run` with `{ "language": "python", "code": "..." }` returns
`{ "success": true, "output": "...", "images": [{ "mime": "image/png", "data": "base64..." }] }`.
Matplotlib uses Agg; `plt.show()` captures and closes current figures, and open figures
are also collected when execution ends. The web UI displays PNGs beneath text output.
Figures do not need persistent server storage and are private to the request.
Runtime errors include the text and figures captured before failure.

Verify a built image using `npx tsx scripts/check-python-sandbox.ts`. CI tests rendering,
network isolation, absence of host secrets, timeout cleanup and subsequent execution.
