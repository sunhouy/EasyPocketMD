# Server Python sandbox

GitHub Actions builds and verifies the Linux amd64 image, then `docker save` exports
`python-sandbox.tar.gz` with a SHA-256 checksum and image ID. The deploy job downloads
this artifact and sends it inside the deployment archive over SCP. The server verifies
its checksum, imports it with `docker load`, verifies the expected image ID and runs
the plotting smoke test before switching releases. It never pulls images or builds the
sandbox on the server. Missing/corrupt artifacts stop deployment; there is no registry fallback.

`bash scripts/setup-python-sandbox.sh --load sandbox/python/python-sandbox.tar.gz`
is the server command (also the default mode). The backend service user needs Docker
access. Root deployment installs Docker from the OS's configured APT repositories if
missing; configure those to a domestic mirror if needed. On other systems install Docker
first. All server-side pip installation uses the Tsinghua mirror, customizable with the
repository variable `SERVER_PIP_INDEX_URL`. CI uses its own reachable default sources.

For an explicit developer/build-machine build use
`bash scripts/setup-python-sandbox.sh --build`, then
`bash scripts/export-python-sandbox.sh OUTPUT_DIRECTORY`.
`PYTHON_SANDBOX_IMAGE` overrides `easypocketmd-python:1`; use the same value for build,
export, load and runtime. No submitted Python executes on the web server host.

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
