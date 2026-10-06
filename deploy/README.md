# Docker deployment

The supported production workflow builds application images in GitHub Actions,
then transfers them to the deployment server over SSH/rsync. Dependencies are
installed during CI builds. The server imports verified images offline rather
than downloading base images or installing application packages.

## Prerequisites

Prepare a Linux amd64 server with Docker Engine, Python and rsync, plus the database,
cache and HTTPS services required by the application. Sandbox resource management
requires systemd, cgroup v2 and Docker's systemd cgroup driver.

This repository's deployment scripts follow an existing server layout. Review and
adapt paths, persistent storage mounts and HTTPS routing before deploying to a
new environment. Keep credentials out of source control and image layers; consult
the repository's environment-variable template and workflow configuration to set
up your own deployment environment.

## Build and publish

1. Configure the application environment, server connection and TLS inputs in your
   repository's protected deployment configuration.
2. Run the CI/CD workflow with the deploy action. It builds the frontend and Docker
   images, checks artifacts and transfers the release.
3. Verify the application's health, persistent files and HTTPS endpoint after
   switching to the new release.
4. Images and public release metadata are archived in GitHub Actions artifacts
   (`docker-release-main` / `docker-release-dev`, retained for 90 days).
   Runtime secrets and TLS keys are excluded.
   Back up database and uploaded-file data separately.

The Python sandbox is built and checked in CI as part of the release. To change its
preinstalled packages, edit its requirements file and publish a new image. See the
[sandbox guide](../sandbox/python/README.md).

## Incremental transfers

The image export is split into compressed objects addressed by content digest.
Rsync transfers objects missing from the server cache; unchanged objects can be
reused across releases. The first deployment requires a complete transfer.
Deleting the cache increases subsequent transfer size.

Import verifies object digests and loaded image identity. Corrupt or missing
objects stop deployment; retry after repairing or retransferring them. Cleanup runs under the deployment lock before transfer and import, then again
after switching. Only current releases for both channels and the incoming
candidate are protected; obsolete containers, image tags, releases and cache
objects are removed. Previous releases occupy no server disk space.

## Resource limits and switching

Deployment checks available disk and memory before importing images. It applies
resource budgets and serializes imports and release switches. Small-memory
servers may briefly stop this application's services to make room; deployment
is not guaranteed to be interruption-free.

Candidate services pass health and protocol checks before activation. Failure
keeps the currently running release available. The rollback action reads the
previous successful release’s GitHub run ID from server metadata, downloads its
artifact in CI and transfers the images again, using current runtime Secrets.
If the artifact has expired, or the previous deployment predates artifact
archiving, redeploy the desired Git commit. The first deployment has no previous
release to restore. Check deployment logs if recovery cannot complete automatically.

## TLS renewal

The deployment scripts support automatic certificate renewal through Certbot
webroot validation and a systemd timer. Initial TLS configuration must be valid;
domain resolution and the HTTP validation endpoint must remain reachable.

Renewed certificates are validated before the HTTPS service reloads. Subsequent
releases retain automatically managed certificates. Invalid configuration in
another hosted site can prevent a global HTTPS configuration check or reload;
renewal does not repair unrelated sites. Monitor renewal logs and certificate
expiry dates.

## Two-server delivery

Both main and dev deployments build once, then transfer concurrently to the original
server and the US edge. Set `IP_US` and `SSHKEY_US` in Actions Secrets; the US SSH
username is the existing `SERVER_USER`. The US server requires Docker, Python,
rsync, nginx and the existing `/www/server/panel/vhost/nginx` TLS layout (the vhost
and certificate directories are created automatically). No MySQL/Redis instance or
Python sandbox is needed on the edge.

The US gateway serves the same built frontend locally. API requests, WebSocket
collaboration/sync, and uploaded files proxy over HTTPS to the original server's
explicit `SERVER_HOST` IP, using the site's hostname for TLS verification. Database,
Redis, file storage and active sessions stay on the original server, avoiding
split uploads and missed cross-region sync notifications. `SERVER_HOST` must be an
IP address, not the geo-routed public hostname. Both regions use the existing main
TLS Secrets; dev retains its existing self-signed certificate behavior.

Only the gateway image is transferred/imported on the edge, with the same
incremental objects and obsolete-version cleanup. No database/API credentials are
copied to the edge. Print client downloads are published to both servers. A failed
deployment on either destination fails the workflow; a successfully switched
server is not rolled back automatically. The original server must stay reachable
from the edge on HTTPS; geo-DNS is managed outside this workflow.

## Stable sandbox builds and transfer diagnostics

CI caches the verified sandbox archive by the Linux/amd64 platform and the hashes
of its Dockerfile, requirements and runner source. An exact hit loads that same
image instead of reinstalling Java, compilers and Python libraries. All runtime
and independent-engine portability tests still run before deployment. A miss
uses the persistent Buildx `gha` cache to reuse unchanged dependency layers, then
saves the archive only after the sandbox checks pass. Cache eviction causes a
normal rebuild; it never falls back to building on either deployment server.
When intentionally refreshing a mutable base image without source changes,
bump the `epmd-sandbox-linux-amd64-v2` cache prefix in both workflows (and change
or pin the Dockerfile base reference to invalidate its dependency layers).

Deployment logs label the origin/US target, count unique reused/missing compressed
objects and required upload bytes, show rsync progress/speed and time each phase.
Long phases print a heartbeat every 30 seconds. SSH connection attempts are
bounded to 30 seconds, and rsync fails after 300 seconds without data transfer;
these are inactivity limits, not bandwidth limits. Interrupted object transfers
retain partial data for a retry. Remote logs distinguish cleanup/capacity checks,
HTTPS setup, archive verification/import and health checks/traffic switching.

## Origin route selection and failed edge diagnostics

Before parallel deployment, CI compares sustained SSH uploads acknowledged by the origin, directly
and through a US SSH TCP relay. Each receiver samples for 20 seconds, bounded
to 64 MiB; each local probe is bounded to about 45 seconds; use the relay only if direct fails or the relay is at least 25% faster.
If neither works, stop before image transfer. The relay uses `SSHKEY_US` only on
CI; the origin login and image stream remain inside end-to-end SSH encryption.
No image archive, origin password or database credentials are copied to the US
host for this transport. A temporary SSH config applies the selected route to
both SSH operations and rsync, and is removed after CI finishes. This addresses
an unfavorable direct network path; it cannot exceed the origin's actual
bandwidth cap, and a short sample cannot guarantee sustained transfer speed.

The regional proxy permits certificate chain verification to depth four while
keeping TLS certificate/hostname verification enabled on main. Failed health
checks record their last HTTP/connection error. Before a failed candidate is
removed, logs include its running/exit/OOM status and Nginx transport errors
(with request/query data redacted), plus a pinned-origin HTTPS probe inside the
gateway to distinguish certificate trust, connectivity and upstream HTTP
failures. These diagnostics do not log container environment or credentials.

## Visible serving route and smaller API runtime

The More menu footer on desktop/mobile reads `/deployment-route.json` from the
current public origin. The domestic and overseas gateways return their own
identity before any API proxying, with no-store headers and Service Worker cache
exclusion. This labels the serving route, rather than guessing a user's country
or treating the API's always-domestic database origin as the frontend region.
Failed/offline checks show Unknown and bilingual labels adapt to language changes.

The trusted API runtime no longer embeds the Emscripten SDK. All C/C++ execution
already runs with GCC/G++ inside the separate sandbox; frontend WASM remains
built by Emscripten in CI. Removing that unused SDK reduces cold-deployment image
size without changing supported languages. Original-server bandwidth remains an
external limit; dependency caching prevents repeated transfers only after those
layers have been successfully installed/retained on the server.

## 国内服务器使用 AtomGit Actions

配置文件为 `.gitcode/workflows/domestic-deploy.yml`，按 AtomGit 官方文档的目录、
`atomgit` 上下文、官方 `checkout` / `setup-node` / `cache` 插件和并发语法编写。
参考：
- https://docs.atomgit.com/docs/help/home/org_project/pipeline/runner-management/
- https://docs.atomgit.com/docs/help/home/org_project/pipeline/writing-pipelines/workflow-file-location-structure/
- https://docs.atomgit.com/docs/help/home/org_project/pipeline/writing-pipelines/using-variables-secrets/

### 启用与切换

1. 将同一份代码同步到自己的 AtomGit 仓库，开启 Actions。
2. 选择可运行 Docker 的 Runner。默认标签为 `[ubuntu-latest, x64, large]`；
   若托管资源池不提供 Docker daemon 或不允许临时特权容器，请使用**独立的国内构建机**
   注册自托管 Runner，将 `runs-on` 换成该 Runner 的标签。不要在空间紧张的生产服务器构建镜像。
3. 在 AtomGit「项目设置 → Actions 密钥与变量」配置下表 Secrets。
   GitHub Secrets 不会自动同步到 AtomGit。服务器密码只保存在 Secrets，不写入仓库。
4. 先手动运行 AtomGit `main` 分支部署，确认成功，再在 GitHub 仓库 Actions **Variables**
   设置 `DOMESTIC_DEPLOY_PROVIDER=atomgit`。设置后 GitHub 跳过国内选路/上传，仅部署美国节点。
   未设置时保留原来的双节点部署；切换期间服务器端现有部署锁仍会串行化导入及切流。
5. 后续 AtomGit `main` / `dev` 分支 push 自动部署对应环境，也可手动运行这两个分支。
   需要保持 GitHub 与 AtomGit 分支同步；本配置不负责跨平台仓库镜像同步。

| AtomGit Secret | 内容 |
| --- | --- |
| `SERVER_HOST` | 国内服务器 IP，例如 `39.106.231.33` |
| `SERVER_USER` | 部署账号，例如 `root` |
| `SERVER_PASSWORD` | 国内服务器 SSH 密码 |
| `SERVER_SSH_HOST_KEY` | 可选，SSH known_hosts 格式的服务器公钥，用于严格校验 |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | 与当前国内部署一致的原数据库配置 |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | 当前 Redis 配置，未使用的项目可留空 |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | 与现有部署一致，保持既有会话兼容 |
| `ADMIN_USER`, `ADMIN_PASSWORD`, `DASHSCOPE_API_KEY` | 沿用现有部署使用的值 |
| `BASE_URL`, `DEV_BASE_URL` | 可选，默认 `https://md.yhsun.cn` / `https://dev.yhsun.cn` |
| `KEY`, `PEM`, `SSL_EMAIL` | 沿用现有 TLS 证书/自动续签配置；开发环境自动生成自签名证书 |

### 构建、缓存与部署

AtomGit 独立构建前端/WASM、API、打印、网关和代码沙箱，镜像仅从国内 Runner
直接传入国内服务器，不从 GitHub 下载数 GiB 的镜像，也不经过美国节点。
首次仍需下载 Emscripten、基础镜像和依赖；后续缓存 npm、SDK 与 BuildKit 层，
镜像构建使用本地缓存后端，不使用 GitHub 专属 `type=gha`。
构建缓存和临时私密配置均排除在 Docker 上下文之外。

发布前执行全项目类型检查、沙箱语言/交互输入/隔离检查、跨 Docker 引擎可移植性检查
及 nginx 配置检查。发布复用现有 CAS 增量上传、磁盘预检、过期项目资源清理、
候选健康检查和切流流程；服务器不保留旧版本回滚备份，上传不设置限速。
`GITHUB_RUN_ID` / `GITHUB_RUN_ATTEMPT` 是兼容现有脚本的变量名，AtomGit 将其映射为
带 `atomgit-` 前缀的运行 ID，避免两个平台的发布目录重名。

美国节点仍由 GitHub 构建部署，数据库/API 读写继续回到原服务器。
两个平台都应部署同一个提交；跨平台构建镜像摘要可能不同，不保证字节级相同。
实际国内上传吞吐需以 AtomGit 的首次运行日志验证，本地检查不能代替真实 Runner/网络验证。
