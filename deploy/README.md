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
