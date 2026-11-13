# VPS deployment: Insta-Autodm-

Production domain: **autodm.webifyit.in**. This deployment runs independently of the Mac and its temporary Cloudflare tunnel.

This VPS uses its existing host Caddy and loopback port 3107. Use `sh scripts/deploy-vps.sh existing-proxy` when updating this installation.

## Installed state

- Checkout: `/opt/insta-autodm` on the VPS; Compose project: `insta-autodm`.
- App, worker, cron, PostgreSQL, and Redis are running. Docker is enabled at boot.
- The original Mac users, Instagram connection, campaign, delivery logs, and Redis job/deduplication state were migrated. The Mac has no running OpenReply web app or worker after cutover.
- The existing host Caddy routes this domain to `127.0.0.1:3107`; all previous site blocks were preserved. Its pre-change configuration was backed up under `/etc/caddy/Caddyfile.before-autodm-*`.
- Zernio's existing webhook now targets the permanent domain; a signed public diagnostic request returned HTTP 200. A fresh Instagram comment is still needed to verify a newly generated provider event end to end.
- Production Gmail magic-link submission was verified in Safari and reached the email verification page.
- Daily database/environment backups run at 02:17 in the server's time zone through `/etc/cron.d/insta-autodm-backup`. Backups are stored in `/opt/insta-autodm/backups`; a manual backup was tested successfully. Copy them off-server as well.
- One migrated comment job exhausted its attempts with Zernio HTTP 400. Its public reply was sent, but its DM failed; the delivery record is retained. This is not cleared or falsely marked successful by deployment.
- GitHub CI, the final Docker build, TypeScript, and 365 tests passed. ESLint has zero errors and one existing navigation warning. All production health checks are healthy.

## Requirements

- A Linux VPS with Docker Engine and Docker Compose v2, SSH access, and enough memory to build Next.js (4 GB RAM recommended for this stack).
- An A record for `autodm.webifyit.in` pointing at the VPS public IPv4 address. Only add an AAAA record if the server also has working public IPv6.
- Open inbound TCP 80 and 443 and your SSH port. PostgreSQL and Redis are internal services; do not publish ports 5432 or 6379.
- `WEB_PORT=3107` binds the app to loopback port 3107 for the existing host reverse proxy. The included optional Caddy service uses ports 80/443 and obtains/renews TLS certificates automatically.
- SMTP egress to Gmail on TCP 465.

If another application already owns ports 80/443, use the existing-proxy option below instead of starting Caddy.

## Clone and configure

```bash
git clone https://github.com/abhi23zc/Insta-Autodm-.git
cd Insta-Autodm-
```

Copy the prepared `.env.vps` privately from the Mac if it has already been configured. This file is ignored by Git and deliberately absent from the public repository and Docker image.

For a new installation, generate it on the VPS without installing Node on the host:

```bash
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD:/app" -w /app node:24-bookworm-slim \
  node scripts/configure-vps.mjs autodm.webifyit.in webifyit.in@gmail.com
```

The generator creates random production secrets, limits login to the supplied email, and refuses to overwrite an existing file. Edit `.env.vps` and replace `APP_PASSWORD` in `EMAIL_SERVER` with the Gmail App Password without spaces. The owner-only file should never be committed. If using Zernio, the Meta environment variables can stay empty.

## Start

For a VPS with ports 80/443 available:

```bash
sh scripts/deploy-vps.sh
```

The script builds the image, starts PostgreSQL and Redis, runs database migrations, then starts the web app, worker, scheduler, and Caddy. Services restart after a server reboot when Docker is enabled. Run only one worker service with this heartbeat configuration.

For an existing host Nginx/Caddy proxy:

```bash
sh scripts/deploy-vps.sh existing-proxy
```

Route `https://autodm.webifyit.in` to `http://127.0.0.1:3107` and preserve Host / X-Forwarded-Proto headers. An example site block is in `deploy/Caddyfile.existing`. A proxy in another Docker container must join this Compose network and route to `web:3000`; its localhost is not the VPS host. Do not start the included HTTPS profile if it conflicts with an existing proxy. For Dokploy, use `compose.vps.yml` without the HTTPS profile, configure the same environment values through your deployment settings, and route the domain to service `web`, container port 3000.

Open https://autodm.webifyit.in/login and sign in with `webifyit.in@gmail.com`. Check https://autodm.webifyit.in/api/health: database, Redis, queue, and worker should all be healthy. The container readiness check intentionally checks web and worker separately so startup does not deadlock.

## Preserve the current Mac campaigns and Instagram connection

A fresh database has no campaigns or Instagram accounts. To migrate the current data, export it from the Mac before production handles events:

```bash
docker compose exec -T postgres pg_dump -U postgres -d openreply -Fc > /private/tmp/openreply-migration.dump
```

Transfer the dump and `.env.vps` privately over SSH. Preserve the Mac's **ENCRYPTION_KEY** in `.env.vps` before starting the VPS worker; without it, the restored Zernio credentials cannot be decrypted. Keep the same NEXTAUTH_SECRET if preserving sessions is desired. Database passwords must match the new VPS database, not the Mac database.

On a new VPS database, before the first application startup:

```bash
docker compose --env-file .env.vps -f compose.vps.yml up -d --wait postgres redis
docker compose --env-file .env.vps -f compose.vps.yml exec -T postgres \
  pg_restore -U openreply -d openreply --no-owner --no-acl --exit-on-error < openreply-migration.dump
sh scripts/deploy-vps.sh
```

Restore into an empty database only. For an existing production database, back it up and plan the restore separately. The SQL dump contains private user and provider data; store it privately and do not add it to Git.

Once the VPS is healthy, open Settings → Zernio and re-save the existing profile to update its webhook to:

```text
https://autodm.webifyit.in/api/zernio/webhook/<workspace-id>
```

Do not leave Zernio pointing to localhost or the temporary tunnel. Stop the Mac worker at cutover so two installations do not act on the same comments. Test with a new matching comment from another Instagram account; confirm a webhook event and a SENT delivery in DM Logs. A successful health response alone does not verify external webhook delivery.

## Updates and backups

Before updates:

```bash
sh scripts/backup-vps.sh
git pull --ff-only
sh scripts/deploy-vps.sh
```

Use `existing-proxy` on every deploy if that is how this VPS is configured. The backup script saves PostgreSQL and the matching encryption/environment secrets to the ignored `backups/` directory; copy them to private off-server storage. Redis uses append-only persistence for queued jobs; a PostgreSQL backup does not include in-flight Redis jobs. For a coordinated cutover, stop incoming events and drain the queue first.

View status or logs:

```bash
docker compose --env-file .env.vps -f compose.vps.yml --profile https ps
docker compose --env-file .env.vps -f compose.vps.yml logs --tail=100 web worker cron
```

Keep Docker volumes when stopping services. Do not use `down -v` unless intentionally deleting the database, queue, and TLS state. Keep `.env.vps` and its ENCRYPTION_KEY backed up across redeployments. This stack uses a separate Compose project name, so it does not alter the existing local development containers.

## Dependency audit

The deployment preparation patched Next.js, Auth.js, Zod, Prisma, and compatible transitive dependencies. The current audit has no critical findings. Remaining findings are Nodemailer and its Auth.js dependents (high), plus the ESLint minimatch chain (moderate). Auth.js currently declares compatibility with Nodemailer 7/8; the patched Nodemailer major lies outside that range, so this setup does not force an unverified major override. Login is restricted to `webifyit.in@gmail.com`. Recheck with `npm audit` when updating dependencies; this report is not a claim that all dependencies are free of known vulnerabilities.
