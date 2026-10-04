# Server Python sandbox

Python code runs in a fresh, non-root Docker container rather than on the API host.
GitHub Actions builds and verifies the Linux amd64 image before deployment. The
Docker release workflow transfers content-addressed image objects with rsync,
verifies layer/runtime identity and imports them offline. The server never pulls
or builds the image. Missing or corrupt artifacts stop deployment.

## Build and add packages

The complete preinstalled library list is [requirements.txt](requirements.txt).
It covers scientific computing, data analysis, machine learning, image processing,
HTTP/HTML parsing and office documents. Noto CJK fonts support Chinese Matplotlib
labels, including fallback for unavailable fonts requested by user code.

To add a library, update the requirements file and rebuild/publish the image.
For an explicit developer/build-machine build:

```bash
bash scripts/setup-python-sandbox.sh --build
bash scripts/export-python-sandbox.sh OUTPUT_DIRECTORY
```

Standalone offline import remains available with
`bash scripts/setup-python-sandbox.sh --load PATH_TO_ARCHIVE`.
`PYTHON_SANDBOX_IMAGE` overrides the image name. Use the same image for build,
export, import and runtime. CI uses reachable build sources; the production
server needs no pip installation. See [Docker deployment](../../deploy/README.md).

## Execution and files

The API allows up to **five concurrent executions**, each with a 20-second compute
budget, 64 KB of source, and up to eight figures / 2 MB total PNG data. Tasks have
256 MB on small hosts or 512 MB otherwise. A shared systemd slice bounds total
sandbox memory and CPU; this requires cgroup v2 and Docker's systemd cgroup driver.
Cancellation and timeouts remove containers before freeing their slots.

Containers have no network, host mounts, capabilities or swap; they use a read-only
root, ephemeral `/tmp`, a process limit and `no-new-privileges`. The trusted API
uses Docker access to schedule them; the execution container does not receive
that socket or business credentials.

The code block toolbar provides upload, file manager and terminal buttons. Code
and commands share a temporary `/tmp/home` workspace. Up to 64 files and 8 MB total
are retained per workspace; one upload batch accepts up to eight files, at most
5 MB each and 8 MB combined. Copy file paths, download or delete files in the manager.
Outputs offer download and insert-into-document actions.

Idle workspaces expire after 30 minutes. Refreshing the page, switching accounts
or restarting the service may discard them. Download important artifacts.
Each command runs in a new process; shell variables, background tasks and installed
software are not retained. `cd` is restricted to the home workspace.

## API and interactive input

`POST /api/code-runner/run` accepts `{ "language": "python", "code": "..." }` and
returns output, error, images and generated files. With `interactive: true`, it
streams NDJSON `input`/`result` events. Submit input to the input endpoint
using the supplied run capability. Input can wait up to two minutes at a time;
the entire run is capped at five minutes. Non-interactive `input()` has no input
stream and may raise EOFError.

Matplotlib uses Agg. `plt.show()` captures figures; remaining open figures are
captured at completion. Runtime errors include available output and figures.
The UI highlights reported source lines and adds Chinese explanations for common
Python errors. The terminal uses the same isolated runner; it is not a persistent PTY.

Verify an image with `npx tsx scripts/check-python-sandbox.ts`. CI checks plotting,
interactive input, network isolation, host-secret isolation, timeout cleanup and
subsequent execution. Deployment includes an interactive protocol check before
switching releases.
