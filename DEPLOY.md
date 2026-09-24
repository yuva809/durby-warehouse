# Deploying Durby Warehouse V2

Single Hetzner CPX22 VPS, everything in Docker Compose:
`reverse-proxy` (Caddy) → `frontend` / `backend` → `postgres`, `redis`, `worker`.
No Kubernetes, no managed cloud services required.

> **Current phase: local development only.** Sections 2–4 (Hetzner) are here
> for when we're ready, but are *not* the current priority — see the project
> status report. Build, run, and test everything locally first with the same
> Docker Compose stack; only the domain/DNS/TLS pieces differ for the VPS.

## 1. Local development

```bash
cp .env.example .env      # edit values — local defaults are fine except passwords
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

Frontend: http://localhost — API: http://api.localhost/api — Health: http://api.localhost/api/health

(macOS/Linux resolve `*.localhost` to 127.0.0.1 automatically for browsers and `curl`. Node's own DNS resolver doesn't always do the same RFC 6761 handling — if a Node script gets `ENOTFOUND api.localhost`, point it at the backend's direct loopback port instead, e.g. `API_BASE=http://localhost:3001`. On Windows, add `127.0.0.1 api.localhost` to your hosts file if it doesn't resolve at all.)

Log in with any seeded account (see `apps/api/prisma/seed.ts`) — the Login page also shows a "Demo accounts" quick-login list in dev (gated by `VITE_SHOW_DEMO_LOGINS`, on by default locally — **must be turned off before any real deployment**, see the checklist below).

Run the full scenario check against the running stack:
```bash
node scripts/e2e-smoke-test.mjs
# or, if Node can't resolve api.localhost on your machine:
API_BASE=http://localhost:3001 node scripts/e2e-smoke-test.mjs
```

### Standalone frontend dev (hot reload)

```bash
docker compose up -d backend postgres redis worker   # everything except frontend/proxy
cd apps/web && cp .env.example .env.local && npm run dev
```

The backend's loopback port is `3001` (not `3000`) — a very common dev-server
port that's often already taken by another project on the same machine.
`apps/web/.env.example`'s `VITE_API_URL` already points at it.

---

## 2. Provision the Hetzner CPX22 — LATER, not now

1. Create a CPX22 (2 vCPU / 4 GB RAM / 40 GB disk is enough to start) — Ubuntu 24.04 image.
2. Point DNS: `A` records for your two domains (e.g. `warehouse.example.com` and `api.warehouse.example.com`) → the server's IP. Caddy needs both resolving *before* it can issue certificates.
3. SSH in, then install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
   (Docker Compose v2 ships as the `docker compose` plugin with that installer — no separate install needed.)
4. Open the firewall for 80/443 only (nothing else — Postgres/Redis are never internet-facing):
   ```bash
   ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
   ```

## 3. Deploy — LATER, not now

```bash
git clone https://github.com/<you>/durby-warehouse.git
cd durby-warehouse
cp .env.example .env
```

Edit `.env` — production checklist:
- [ ] `FRONTEND_DOMAIN` / `API_DOMAIN` / `VITE_API_URL` / `FRONTEND_URL` → your real domains from step 2.
- [ ] `POSTGRES_PASSWORD`, `JWT_SECRET` → generate real random values (`openssl rand -base64 48`), never the example placeholders.
- [ ] `VITE_SHOW_DEMO_LOGINS=false` — **do not ship the quick-login account list to a real deployment.**
- [ ] `SEED_DEMO_PASSWORD` → set something you'll actually use, or leave default and change it immediately after first login (there's no "change password" UI yet, so for a real deployment either seed with the password you intend to keep, or reset it directly in the DB).

```bash
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

## 4. Verify — LATER, not now

```bash
curl https://api.warehouse.example.com/api/health
# {"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}},...}

curl -I https://warehouse.example.com
# HTTP/2 200 — and check the cert: browsers should show it as valid, issued by Let's Encrypt (via Caddy's automatic ACME)
```

If a domain doesn't get a certificate, check `docker compose logs reverse-proxy` — almost always a DNS record that hasn't propagated yet, or port 80 not reachable from the internet (Caddy needs it for the ACME HTTP challenge).

## 5. First admin login

The seed script already creates `admin@durby.tech` (`SUPER_ADMIN`) with the password from `SEED_DEMO_PASSWORD`:

```bash
curl -X POST http://api.localhost/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@durby.tech","password":"<your SEED_DEMO_PASSWORD>"}'
```

That returns a JWT you can use to create real users via `POST /api/users` (see the full endpoint list in the project's status report / README).

## 6. Back up and restore Postgres

Works the same locally or on the VPS:
```bash
./scripts/backup-db.sh                      # writes ./backups/durby-warehouse-<timestamp>.sql.gz, keeps last 14
./scripts/restore-db.sh ./backups/durby-warehouse-<timestamp>.sql.gz
```

On the VPS, put the backup on a cron (daily is reasonable at this scale):
```
0 3 * * * cd /path/to/durby-warehouse && ./scripts/backup-db.sh >> /var/log/durby-backup.log 2>&1
```

**Copy backups off the VPS regularly** (e.g. `rsync`/`rclone` to another machine or object storage) — a backup that only lives on the same disk as the database doesn't protect against the VPS itself being lost.

## 7. Updating

```bash
git pull
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
```

`migrate deploy` only applies new migrations — it's safe to run every deploy, including when there's nothing new.

## Known limitations (be aware of these before relying on this in production)

- **No password reset / user-management UI.** Users are created via the API directly (`POST /api/users`) or the seed script; there's no frontend for it yet.
- **The Login page's demo-account quick-login list must be disabled** (`VITE_SHOW_DEMO_LOGINS=false`) before any real deployment — see the production checklist above.
- **Login is rate-limited to 5 attempts/minute per IP** (`@Throttle` on `/auth/login`) — intentional brute-force protection, but worth knowing if you're scripting rapid logins against a local stack (you'll see `429 ThrottlerException`; just wait a minute).
- **Manager-only actions poll rather than push.** Query results are cached for ~15s (TanStack Query `staleTime`); two managers acting on the same request at the same time will each see the truth on their next fetch/navigation, not instantly via a live socket. The backend's locking is what actually prevents double-approval (verified live — see the concurrency test in the E2E smoke test) — this is purely a "how fast does the screen refresh" note, not a correctness gap.

Verified against the real Dockerized stack (local Docker Desktop, `docker compose up -d --build`, migrated + seeded Postgres, real Redis): the full branch → manager → driver → delivery → confirm-receipt workflow, partial approval, partial picking with a discrepancy, and the two-manager concurrent-approval race (exactly one wins, one gets `409`) all pass both via `scripts/e2e-smoke-test.mjs` and by hand in the browser.
