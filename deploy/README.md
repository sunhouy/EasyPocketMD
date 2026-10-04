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
4. Retain a previous successful release and its required images for rollback.
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
objects stop deployment; retry after repairing or retransferring them. Keep the
objects required by retained releases when cleaning disk space.

## Resource limits and switching

Deployment checks available disk and memory before importing images. It applies
resource budgets and serializes imports and release switches. Small-memory
servers may briefly stop this application's services to make room; deployment
is not guaranteed to be interruption-free.

Candidate services pass health and protocol checks before activation. Failure
attempts to restore the previous release. The rollback action requires a retained
successful Docker deployment; the first deployment has no earlier Docker release
to restore. Check deployment logs if recovery cannot complete automatically.

## TLS renewal

The deployment scripts support automatic certificate renewal through Certbot
webroot validation and a systemd timer. Initial TLS configuration must be valid;
domain resolution and the HTTP validation endpoint must remain reachable.

Renewed certificates are validated before the HTTPS service reloads. Subsequent
releases retain automatically managed certificates. Invalid configuration in
another hosted site can prevent a global HTTPS configuration check or reload;
renewal does not repair unrelated sites. Monitor renewal logs and certificate
expiry dates.
