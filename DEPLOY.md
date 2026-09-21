# Deploying Durby Warehouse V2

Single Hetzner CPX22 VPS, everything in Docker Compose:
`reverse-proxy` (Caddy) → `frontend` / `backend` → `postgres`, `redis`, `worker`.
No Kubernetes, no managed cloud services required.

## 1. Local development

```bash
cp .env.example .env      # edit values — local defaults are fine except passwords
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

Frontend: http://localhost — API: http://api.localhost/api — Health: http://api.localhost/api/health

(macOS/Linux resolve `*.localhost` to 127.0.0.1 automatically. On Windows, add `127.0.0.1 api.localhost` to your hosts file if it doesn't.)

## 2. Provision the Hetzner CPX22

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

## 3. Deploy

```bash
git clone https://github.com/<you>/durby-warehouse.git
cd durby-warehouse
cp .env.example .env
```

Edit `.env`:
- `FRONTEND_DOMAIN` / `API_DOMAIN` → your real domains from step 2.
- `POSTGRES_PASSWORD`, `JWT_SECRET` → generate real random values (`openssl rand -base64 48`), never the example placeholders.
- `SEED_DEMO_PASSWORD` → set something you'll actually use, or leave default and change it immediately after first login (see step 6 — there's no "change password" UI yet, so for a real deployment either seed with the password you intend to keep, or reset it directly in the DB).

```bash
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

## 4. Verify

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
curl -X POST https://api.warehouse.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@durby.tech","password":"<your SEED_DEMO_PASSWORD>"}'
```

That returns a JWT you can use to create real users via `POST /api/users` (see the full endpoint list in the project's status report / README).

## 6. Back up and restore Postgres

```bash
./scripts/backup-db.sh                      # writes ./backups/durby-warehouse-<timestamp>.sql.gz, keeps last 14
./scripts/restore-db.sh ./backups/durby-warehouse-<timestamp>.sql.gz
```

Put the backup on a cron (daily is reasonable at this scale):
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

- **Frontend is not yet wired to this backend.** The `frontend` container serves the working V1 UI (Zustand + localStorage) — it's the right container shape and builds/serves correctly, but its service layer still hasn't been repointed at these API endpoints. See the project status report for what that involves.
- **No password reset / user-management UI.** Users are created via the API directly (`POST /api/users`) or the seed script; there's no frontend for it yet.
- **Concurrency and the full workflow have not been run against a live database in this environment** (no Docker/Postgres was available in the sandbox this was built in) — the logic was built and reasoned through carefully (see the status report), but `scripts/e2e-smoke-test.mjs` needs to actually be run here, on a real deployment, before you trust it in front of a customer.
