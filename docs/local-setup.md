# Local setup and project notes

## Project structure

OpenReply is a self-hosted Instagram comment/DM automation application.

- `app/` contains the Next.js 16 / React 19 dashboard and API routes.
- `lib/auth.ts` implements Auth.js email magic-link login and database sessions.
- `lib/queue/` matches incoming events to campaigns and delivers messages with BullMQ.
- `worker/dm-worker.ts` runs the queue consumer, heartbeat, comment reconciliation, and next-reel attachment.
- `lib/instagram/`, `lib/meta/`, and `lib/zernio/` implement provider integrations.
- `prisma/` defines the PostgreSQL schema and 24 migrations for users, workspaces, campaigns, logs, and analytics.
- `__tests__/` contains the Vitest suite.

The web app and worker run separately and share PostgreSQL, Redis, and the encryption key. Stopping the worker stops message delivery even while the dashboard remains accessible.

## This machine's configuration

Dependencies were already installed and verified with `npm ls --depth=0`. The Prisma client has been generated and all migrations are applied.

| Service | Address |
| --- | --- |
| Web app (local) | http://localhost:3000 |
| Public app / provider callbacks | https://strain-route-lady-safely.trycloudflare.com |
| Sign in | http://localhost:3000/login |
| Email sender | `webifyit.in@gmail.com` |
| SMTP | `smtp.gmail.com:465` (TLS) |
| Optional Mailpit inbox (unused) | http://localhost:8025 |
| PostgreSQL | `localhost:5432`, database `openreply` |
| Redis | `localhost:6381` |
| Health endpoint | http://localhost:3000/api/health |

The local `docker-compose.override.yml` keeps Redis on port 6381 to avoid a conflict and includes Mailpit from the initial setup. The ignored `.env` now uses Gmail SMTP with an App Password for real email delivery. Its permissions are restricted to the file owner. The app no longer sends to Mailpit.

To sign in, enter `webifyit.in@gmail.com` on the login page, then open the magic link from your Gmail inbox. Links now use the public tunnel address. The initial setup verification also created `developer@openreply.local` and its workspace. Sign-in remains unrestricted unless `ALLOWED_EMAILS` is configured.

## Restart

Start the backing services:

```bash
docker compose up -d --wait
```

Run the web app and worker in separate terminals from the project root:

```bash
npm run dev -- --hostname 127.0.0.1
```

```bash
npm run worker
```

The worker script now loads `.env` with Node's `--env-file-if-exists` option. Previously it started without the database, queue, and encryption settings. Environment variables supplied by a hosting platform take precedence over the file.

Stop each Node process with Ctrl+C. Stop the backing services with `docker compose stop`; database and Redis data remain in their Docker volumes.

## Verification

Verified during setup:

- Dependencies have no missing or invalid top-level packages.
- Prisma generation and migration deployment succeed; no migrations remain pending.
- TypeScript, ESLint, and the production build pass.
- Vitest: 365 tests pass; 19 tests in 3 files are skipped by the suite.
- `/api/health` returns HTTP 200 with healthy database, Redis, queue, and worker checks.
- `/login` returns HTTP 200.
- A local SMTP magic link creates an authenticated session and workspace and opens the dashboard.

## Enable real Instagram automation

The local dashboard works, but Instagram credentials in `.env` remain placeholders. Choose either a direct Meta app or Zernio in Settings; see [the setup guide](setup.md) and [Zernio guide](zernio.md).

Zernio's webhook originally pointed to localhost and could not receive external events. Only the five-minute polling fallback delivered comments. This was corrected by starting `cloudflared tunnel --url http://127.0.0.1:3000 --no-autoupdate`, updating `NEXTAUTH_URL` to the resulting public HTTPS address, updating the existing Zernio webhook, and restarting the worker. A signed diagnostic request through the public endpoint returned HTTP 200. A real comment was subsequently confirmed SENT through the fallback; fresh Zernio event delivery still needs a new comment to verify end to end.

Keep the tunnel, web app, worker, and Docker services running. This is a temporary tunnel: restarting it can assign a different URL. When the address changes, update both `.env` and the Zernio webhook (re-saving the existing Zernio profile in Settings registers the current base URL), then restart the worker. A stable deployment or named tunnel avoids this recurring setup. The existing `Caddyfile.local` was preserved.

Gmail SMTP authentication and a test email have been verified. The Zernio account and campaign are connected, and successful comment delivery is recorded in the database. For production, keep the worker running continuously and configure the scheduled token refresh and follower snapshots described in the deployment guides.
