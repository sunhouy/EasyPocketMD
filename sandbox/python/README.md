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

## Java 与 Bash/Shell

同一镜像包含 JDK 和 Bash。代码块语言支持 `java`、`bash`、`shell`、`sh`，共用 Python 沙箱的无网络、只读根目录、非 root、CPU/内存/进程数、超时与输出限制。

Java 自动识别顶层公开类名，生成同名 `.java` 文件；支持 package，UTF-8 编译后按完整类名运行。源码与 class 放在临时编译目录，不作为用户文件返回。工作目录仍是用户的沙箱文件目录，上传文件和生成文件沿用现有机制。

Bash/Shell 脚本由解释器读取，无需在 `/tmp` 执行文件。`bash`、`shell` 使用 Bash，`sh` 使用 POSIX Shell；这些语言支持在运行面板中交互输入，沿用现有输入协议。

Actions 的 `check-python-sandbox.ts` 在新镜像中实际验证 Java 公开类、package、中文输出以及三个 Shell 别名，再按现有镜像流程发布。旧镜像缺少语言能力时拒绝执行，不回退到服务器宿主机。

### C/C++ 与原生语言交互输入

同一镜像包含 GCC/G++，C/C++ 使用 C17/C++17 原生编译，在单独的 32 MB 临时编译目录执行，源码和二进制不会成为用户文件。C/C++/Java/Bash/Shell 共享现有上传、文件管理和流式输入协议，支持 scanf、cin、Scanner、read 等连续输入。等待输入时暂停计算计时，输入仍受两分钟等待和五分钟会话上限限制，取消或断开连接会销毁容器及子进程。帮助仅展示当前代码块语言的说明和支持语言列表。
