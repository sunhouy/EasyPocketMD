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
keeps the currently running release available. Previous server images are removed;
to redeploy an older version, download its retained GitHub artifact and deploy it
with the current server runtime configuration, as described below. Expired artifacts
require rebuilding the desired Git commit.

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

## Direct delivery and failed edge diagnostics

GitHub Actions transfers directly to each server over SSH/rsync. The US server is
never used as a relay to the original server. No route probe or deployment-provider
variable affects the domestic upload.

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

## 从自己的电脑手动部署国内服务器

新流水线在 SSH 上传前归档 `docker-release-main` / `docker-release-dev`，保留 90 天
（实际保留期限受仓库/组织策略限制）。上传服务器失败也可下载已完成的构建产物。
包内包含所有 CAS 镜像对象、校验元数据和部署脚本，**不包含 app.env、TLS 私钥或数据库密码**。

适用于国内服务器已有一次成功的 Docker 部署；脚本从该环境的当前发布目录读取
数据库、Redis、JWT 和证书配置，不将这些配置下载到电脑。首次部署或当前配置丢失时
应先通过 GitHub Actions Secrets 完成初始化。Linux/macOS 或 Windows WSL 均可作为上传端，
无需安装 Docker 或重新构建镜像。生产服务器仍需要既有 Docker/Python/rsync 环境。

1. 合并本次修改后，运行 GitHub CI/CD，等待 `Archive deployable images before server upload`
   步骤完成。在该次运行的 Artifacts 下载 `docker-release-main` 并解压到一个空目录。
   不要只下载 `python-sandbox-image`，它不包含 API、前端网关和打印镜像。
   也可以使用 GitHub CLI（替换 RUN_ID）：

   ```bash
   gh run download RUN_ID --repo sunhouy/EasyPocketMD -n docker-release-main -D epmd-release
   ```

2. 上传端安装 `ssh`、`rsync`、`sshpass`。Ubuntu/WSL：

   ```bash
   sudo apt-get update
   sudo apt-get install -y openssh-client rsync sshpass
   ```

3. 从解压目录执行，密码会隐藏输入，不放入命令历史：

   ```bash
   cd epmd-release
   bash manual-deploy.sh 39.106.231.33 root main
   ```

   若使用 SSH 私钥，改为：

   ```bash
   SERVER_SSH_KEY_FILE="$HOME/.ssh/id_ed25519" bash manual-deploy.sh 39.106.231.33 root main
   ```

   开发环境需下载 `docker-release-dev` 并将最后一个参数换成 `dev`；环境不匹配会停止。
   如果已有 Actions 正在部署，等其结束再运行，服务器部署锁会拒绝重叠的导入/切流。

脚本自动创建新发布目录，复用服务器当前私密配置，清理过期项目资源并检查空间，
通过 SSH/rsync 从你的电脑**直接上传国内服务器**，然后验证镜像、导入、健康检查并切流。
上传中断后重新运行同一下载包会复用完整对象及 rsync 部分数据。
成功时末尾显示 `Docker deploy completed: main` 和 `DONE Verify/import images and activate release`。
随后访问 `https://md.yhsun.cn/api/health` 并检查网页和已有文件。

服务器不保存回滚备份；要部署旧版，使用 GitHub 上仍在保留期内的旧镜像包。
手动命令只更新国内节点，美国节点仍由 GitHub 自动部署，需保持两边发布版本一致。
当前服务器是否具备可复用配置需真实运行验证，本说明不表示已经替你执行部署。
