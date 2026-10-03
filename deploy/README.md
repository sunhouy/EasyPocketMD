# Docker 服务部署

主站和开发站通过 `.github/workflows/docker-deploy.yml` 共用部署逻辑。前端/API、文档转换、Emscripten、云打印、应用 Nginx 网关及 Python 沙箱均由镜像提供；服务器不再执行 npm/pip 安装、不再用 PM2 运行新服务。

## 国内服务器与增量传输

GitHub Actions 下载基础镜像、安装依赖并构建镜像。BuildKit 的 GitHub Actions 缓存复用未改变的构建层。随后 `image-cas.py` 将 Docker 导出包中的成员按原始内容 SHA-256 保存成独立压缩对象。

通过 SSH/rsync 将对象上传到 `/www/wwwroot/easypocketmd/docker/cache/objects`，`--ignore-existing` 只传服务器缺少的对象，断点文件单独保留供重试。首次需要完整镜像，此后仅新增/变化内容会传输。应用代码与前端放在 Dockerfile 最后，依赖未改变时无需重新上传依赖层。服务器验证对象摘要、重组 docker load 数据流，再比较实际镜像层和运行配置，不访问 Docker Hub/GHCR。

损坏对象会被删除并明确报错；重新执行部署即可补传。保留对象缓存才能保持增量效果。当前不自动删除旧镜像/缓存；清理前必须保留当前与上一发布的镜像和 `release.json` 引用的对象，以免影响回滚。

## 服务器前提与已有数据

服务器需要 Linux amd64、Docker Engine、Python >=3.8、rsync，以及现有宝塔 Nginx TLS 入口。已有 Python 沙箱部署已安装 Docker；首次准备机器时可从配置好的国内系统软件源安装 Docker/rsync/Python。服务器无需安装 Node、Pandoc、wkhtmltopdf、Emscripten 或 Python 包。

沿用 `SERVER_HOST`、`SERVER_USER`、`SERVER_PASSWORD` 及现有 DB/Redis/JWT/BASE_URL/KEY/PEM secrets；无需新增镜像仓库。可选 `SERVER_SSH_HOST_KEY` 保存完整 known_hosts 行，用于固定 SSH 主机密钥。配置、密码及证书通过权限 600 的独立控制文件传输，不打进镜像、缓存或 GitHub artifact。

MySQL、Redis 及 TLS 入口继续复用现有服务，避免迁移数据库或中断服务器的其他网站。容器使用 host 网络保持 DB_HOST=localhost 等旧配置可用；应用、打印和网关只监听本地地址。宿主 Nginx 仅终止 TLS 并转发到容器网关。`print.yhsun.cn` 的现有 TLS vhost 需存在，它的打印代理端口会随主站切换。

主站数据挂载自 `/www/wwwroot/js_shared`，开发站自 `/www/wwwroot/js_dev_shared`。uploads、user_uploads、user_files、avatars、screenshots 均持久化；初次迁移复制旧目录中的文件，旧进程关闭后补齐最后的修改，较新的容器文件优先。`/www/wwwroot/static` 继续保存下载文件、版本和敏感词，并以只读方式挂载。

可信 API 容器通过 Docker socket 调度 Python 沙箱；提交代码的沙箱不挂载 socket、业务目录或凭据，仍禁止联网、只读文件系统、限时 20 秒/512 MB，并使用普通用户。Python 图表和文字经 JSON 返回网页。

## 切换与回滚

候选槽位启动 app/print/gateway 容器后，检查 API、实际 HTTP WASM 摘要和打印 WebSocket；随后检查并重载 TLS 入口。检查失败恢复原配置并删除候选容器，不停止当前服务。成功后保存 `state-main.json`/`state-dev.json`，再停止旧容器和本项目的旧 PM2 进程，Docker 的 restart policy 负责重启。

主站 Actions 手动选择 `rollback`，重新启动上一份 Docker 发布并通过同样的检查再切换。首次从 PM2 迁移时尚无上一份 Docker 发布，需完成至少两次 Docker 发布后才能使用该回滚入口；旧目录仍保留，不被清空。

## 小内存服务器与部署资源

低于 3 GiB 内存的机器使用 app 512 MiB、print 96 MiB、gateway 48 MiB 的上限，关闭额外 swap 配额，Node 堆上限为 256 MiB；Python 沙箱最多同时运行一个、内存 256 MiB。大内存机器 app 上限为 1024 MiB，Python 沙箱仍为 512 MiB/最多两个。部署健康校验按块计算 WASM 摘要。

传输前检查新增压缩缓存与 Docker 内容/解包空间，并限速为 8 MiB/s；空间不足明确终止，保留现有服务。导入前至少需要 384 MiB 可用内存。小内存机器要求 systemd/cgroup v2，镜像导入期间临时限制 Docker 和 containerd 守护进程的 CPU、memory.high 与 I/O 权重，结束后恢复原限制；不会重启 Docker、删除用户数据或自动清理回滚镜像。已安装且内容身份一致的发布跳过重复导入。服务器锁禁止并发导入和切换。

小内存机器切换期间短暂停止本网站旧容器，避免新旧应用同时占满内存；新版本健康检查失败则重启旧容器。其他网站、MySQL、Redis 和宿主 Nginx 不停止。此模式会有短暂不可用时间，大内存机器仍采用新旧服务并行校验。
