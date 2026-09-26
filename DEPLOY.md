# Deploying Asia Might Super Market (Durby Warehouse V2)

One Hetzner VPS, everything in Docker Compose:

```
Internet ─► 80/443 ─► reverse-proxy (Caddy, automatic HTTPS)
                        ├─► frontend  (nginx, static React build)
                        └─► backend   (NestJS API) ─► postgres, redis, ocr
                            worker    (same image, BullMQ queues) ─► postgres, redis
```

No Kubernetes and no managed services. **Only Caddy is reachable from the internet.**
Postgres, Redis, the backend and the OCR service are on a private Docker network;
their loopback-only host ports (`127.0.0.1:…`) exist for debugging on the server itself.

> Nothing in this file contains a secret. Real values live only in the server's
> `.env` (git-ignored, mode 600). Never paste secrets into chat, tickets or commits.

## 1. Local development

```bash
cp .env.example .env      # then edit: for local use set VITE_SHOW_DEMO_LOGINS=true and a SEED_DEMO_PASSWORD (12+ chars)
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
# Demo data (9 demo users, 6 locations, 47 products). The backend container always runs with
# NODE_ENV=production, so the seed fails closed unless you explicitly consent and supply a strong password:
set -a; . ./.env; set +a
docker compose exec -e ALLOW_DEMO_SEED=true -e SEED_DEMO_PASSWORD backend npm run seed
```

`SEED_DEMO_PASSWORD` must be at least 12 characters and **not** the public default `ChangeMe123!` — that is
deliberate, so that this command can never quietly create well-known logins on a real server. (The frontend's
demo quick-login uses the same value, so rebuild the frontend after changing it.) Running the seed from a host
checkout with `NODE_ENV` unset, e.g. `cd apps/api && DATABASE_URL=postgresql://…@localhost:5433/… npm run seed`,
still works as before with the default demo password.

**Never seed a real deployment.** See §5 for production initialization.

Frontend: http://localhost — API: http://api.localhost/api — Health: http://api.localhost/api/health

(Browsers and `curl` resolve `*.localhost` automatically. If a Node script gets
`ENOTFOUND api.localhost`, use the backend's loopback port instead:
`API_BASE=http://localhost:3001 node scripts/e2e-smoke-test.mjs`.)

Local checks:

```bash
node scripts/e2e-smoke-test.mjs                # request → transfer → delivery workflow + concurrency
./scripts/rate-limit-proxy-test.sh             # per-client rate limiting through Caddy (local stack only)
cd apps/api && npm run test:trust-proxy        # no DB/Docker needed
# these need DATABASE_URL pointing at the stack's Postgres (e.g. postgresql://…@localhost:5433/…):
npm run test:password-flows && npm run test:user-access && npm run test:reset-admin-password && npm run test:supplier-invoice-upload && npm run test:production-init && npm run test:audit-fixes
cd ../web && npm run test:logic                # route access + warehouse lookup (pure logic, no browser)
```

Standalone frontend with hot reload:

```bash
docker compose up -d backend postgres redis worker ocr
cd apps/web && cp .env.example .env.local && npm run dev
```

## 2. The server (already provisioned)

Hetzner VPS: Ubuntu 26.04 LTS (x86_64), 2 vCPU, 4 GB RAM, ~75 GB disk. State as configured:

| Area | Setting |
|---|---|
| Admin access | Non-root sudo user `yuvanesh`, SSH public-key login only |
| SSH | `/etc/ssh/sshd_config.d/10-hardening.conf`: `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `PermitRootLogin no` |
| Firewall | UFW active: deny incoming; allow 22/tcp, 80/tcp, 443/tcp (IPv4 + IPv6) |
| Docker | Docker Engine + Compose plugin from **Docker's official apt repository** (Ubuntu `resolute` is supported), service enabled at boot |

Log in with `ssh yuvanesh@<SERVER_IP>` and use `sudo`. `yuvanesh` is deliberately **not** in the
`docker` group (that is root-equivalent), so run Docker commands with `sudo`.

Quick health check of the baseline:

```bash
sudo ufw status verbose
sudo sshd -T | grep -E '^(passwordauthentication|permitrootlogin|kbdinteractiveauthentication) '
docker --version && docker compose version
ss -tlnp | grep -v 127.0.0        # only 22 (and, once deployed, 80/443) should be listening publicly
```

To rebuild an equivalent server from scratch, follow Docker's official instructions for Ubuntu
(<https://docs.docker.com/engine/install/ubuntu/>, "Install using the apt repository") rather than the
`get.docker.com` convenience script.

> **Docker bypasses UFW for published ports.** UFW will not block a port Compose publishes as
> `"5432:5432"`. That is why every non-Caddy port in `docker-compose.yml` is bound to `127.0.0.1`.
> **Never remove the `127.0.0.1:` prefix**, and never add a new public `ports:` entry without deciding
> that the service really should face the internet. To reach Postgres from your laptop, use an SSH
> tunnel: `ssh -L 5433:127.0.0.1:5433 yuvanesh@<SERVER_IP>`.

### Recommended before the first real load (not applied yet)

The server has 4 GB RAM and no swap; PaddleOCR inference plus Postgres, Redis, the API and worker can
exhaust it. Add a swap file:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Docker's default log driver keeps logs forever; cap them in `/etc/docker/daemon.json`
(`{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}`, then `sudo systemctl restart docker`).

## 3. DNS

Caddy needs both names resolving to the server **before** it can issue certificates:

- `A` record: `app.example.com` → `<SERVER_IP>`
- `A` record: `api.app.example.com` → `<SERVER_IP>` (add matching `AAAA` records only if you also want IPv6)

Ports 80 and 443 must be reachable from the internet (UFW already allows them); Caddy uses port 80
for the Let's Encrypt HTTP challenge.

## 4. Deploy

**A real deployment uses real client data only. Nothing here creates demo users, branches or products, and
there is no default password anywhere.** Prepare the server's `.env` first, then follow §5.

On the server:

```bash
git clone https://github.com/yuva809/durby-warehouse.git && cd durby-warehouse
umask 077 && cp .env.example .env          # .env must not be world-readable
```

Edit `.env` (`nano .env`). Everything below is required for production:

| Variable | Value |
|---|---|
| `FRONTEND_DOMAIN`, `API_DOMAIN` | Bare domains, no scheme (e.g. `app.example.com`, `api.app.example.com`) |
| `VITE_API_URL` | `https://<API_DOMAIN>/api` (baked into the frontend at build time) |
| `FRONTEND_URL` | `https://<FRONTEND_DOMAIN>` (CORS origin) |
| `POSTGRES_USER`, `POSTGRES_DB` | Your choice |
| `POSTGRES_PASSWORD` | **Generate** (below) |
| `JWT_SECRET` | **Generate**, at least 32 characters (below) |
| `REDIS_PASSWORD` | **Generate** (below). If unset, Redis falls back to a publicly known placeholder |
| `VITE_SHOW_DEMO_LOGINS` | **`false`**. `true` ships a one-click demo-accounts list to your login page |

Do **not** set `SEED_DEMO_PASSWORD`; it belongs to the local demo seed only (§1).

Generate secrets **without printing them** by writing straight into the file:

```bash
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=\n')|" .env
sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=\n')|" .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')|" .env
chmod 600 .env
```

(`base64` can contain `/`, `+`, `=`. The database and Redis passwords are stripped of them so they stay safe
inside the connection URL; `JWT_SECRET` isn't used in a URL and can keep them.) Keep an offline copy of `.env`
in your password manager: losing `POSTGRES_PASSWORD` locks you out of the existing database volume.

## 5. Initialize production (no demo data)

The order matters; each step depends on the one before.

**1. Build and start.** The first build downloads the OCR models and takes several minutes.

```bash
sudo docker compose up -d --build
sudo docker compose ps                     # wait until backend, postgres, redis, ocr show "healthy"
```

**2. Create the schema.** Migrations are never run automatically. This also inserts the reference data the app
needs (the `REQ`/`TR`/`OC`/`DC`/`INV` number sequences); it is safe to repeat on every deploy.

```bash
sudo docker compose exec backend npx prisma migrate deploy
```

**3. Create the first administrator (one time).** This is the *only* way a first admin can exist: every API route
that creates users needs an already-logged-in administrator, and there is deliberately no public sign-up or
admin-creation endpoint. Run it in an interactive terminal, with your own real email and name. The password is
typed at a hidden prompt, entered twice, and stored only as a bcrypt hash:

```bash
sudo docker compose exec -e ADMIN_EMAIL=you@yourcompany.com -e "ADMIN_NAME=Your Name" backend npm run bootstrap:admin
```

- `ADMIN_EMAIL` must already be lowercase (login is a case-sensitive exact match).
- The password needs 12+ characters, and can't be a known default (including `ChangeMe123!`), contain your email name, or be repetitive.
- It shows the target database and makes you type the database name to confirm before writing anything.
- **It only runs on a database with no users at all.** If any user exists, whether a previous admin, a demo-seeded
  database, or a restored backup, it changes nothing and exits with code 3. So a rerun, a second operator, or a
  mistaken run against a live system is a harmless no-op, and two simultaneous runs can't both succeed.
- It needs the schema from step 2 and says so if it's missing.
- For automation only, set `ADMIN_PASSWORD` and `BOOTSTRAP_CONFIRM_DB=<database name>` instead of using the prompt
  (`docker compose exec -e ADMIN_PASSWORD -e BOOTSTRAP_CONFIRM_DB …`, exporting them from a protected file, not typing the password on the command line).

**4. Log in and load your real data (first data).** Sign in to the web app with the admin. The web app has no screens for
users, locations or categories yet, so create those with the API using the helpers below (they prompt for
passwords, so no password lands in your shell history), then add the rest in the app. Run on the server or any
machine that can reach the API:

```bash
export API=https://<API_DOMAIN>/api ADMIN_EMAIL=you@yourcompany.com
login() {   # prints a token; asks for the password without echo
  python3 -c 'import getpass,json,os,urllib.request as u
pw=getpass.getpass("Password for "+os.environ["ADMIN_EMAIL"]+": ")
r=u.Request(os.environ["API"]+"/auth/login",data=json.dumps({"email":os.environ["ADMIN_EMAIL"],"password":pw}).encode(),headers={"Content-Type":"application/json"})
print(json.load(u.urlopen(r))["accessToken"])'
}
api() { curl -sS -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "$@"; echo; }
create_user() {   # create_user email "Full Name" ROLE [locationId]; the new user's password is prompted
  read -rsp "Password for $1: " NEWPW; echo >&2
  EMAIL="$1" NAME="$2" ROLE="$3" LOC="${4:-}" NEWPW="$NEWPW" python3 -c 'import json,os
d={"email":os.environ["EMAIL"],"name":os.environ["NAME"],"password":os.environ["NEWPW"],"role":os.environ["ROLE"]}
if os.environ["LOC"]: d["locationId"]=os.environ["LOC"]
print(json.dumps(d))' | api -X POST "$API/users" --data @-
  unset NEWPW
}
TOKEN=$(login); export TOKEN          # tokens expire (JWT_EXPIRES_IN, default 12h): run this again when they do
```

Then, in this order (each command prints the created record including its `id`):

```bash
# 1. The warehouse. The app looks up the location of type WAREHOUSE, so this must exist before anything else works.
api -X POST $API/locations -d '{"name":"Central Warehouse","type":"WAREHOUSE","city":"<city>"}'
# 2. Each branch (note the returned ids)
api -X POST $API/locations -d '{"name":"<branch name>","shortName":"<short>","type":"BRANCH","city":"<city>"}'
# 3. Product categories. The Add Product screen needs at least one; a new database has none.
api -X POST $API/categories -d '{"name":"<category name>"}'
# 4. People (roles: WAREHOUSE_MANAGER, BRANCH_USER (needs the branch's locationId), DRIVER). Never reuse a password.
create_user manager@yourcompany.com "Name" WAREHOUSE_MANAGER
create_user branch1@yourcompany.com "Name" BRANCH_USER <branch-location-id>
create_user driver1@yourcompany.com "Name" DRIVER
```

Add products from the **Products → Add Product** screen (or `POST /products`), and receive stock through
**Stock Intake**. Creating a location also creates zeroed inventory rows for the existing products. A warehouse manager can
create branch and driver accounts, but only a `SUPER_ADMIN` can create another `SUPER_ADMIN`.

**Every account created this way must choose its own password at first sign-in.** The initial password you set is only
temporary: the server refuses everything except "change password" until the user has set their own, and the
API cannot be used around it. (The `bootstrap:admin` administrator chose their own password already, so isn't asked again.)

**Recommended:** create a second `SUPER_ADMIN` (`create_user backup-admin@yourcompany.com "Name" SUPER_ADMIN`) and store its password offline.
It is your recovery path: a `SUPER_ADMIN` can reset another `SUPER_ADMIN` (see below).

### User & Access Management (inviting people)

Use **Users** in the sidebar (heading "User & Access Management"). Nobody ever chooses, sees or is emailed anyone else's password:
you invite a person, the app gives you a **one-time link**, and they open it and set their own password.

**Setup order** (the invite form tells you when a step is missing): create the warehouse and branches first (§5 step 4), then invite people.
A branch user can only be invited into an **existing, active branch**.

**One warehouse, many branches.** The application supports exactly one active warehouse. The API refuses a second one (409, also when two are
created at the same instant, and when re-activating an old warehouse while another is active). To replace it, deactivate the current one first.
The screens find the warehouse from the location data (its type), never by a fixed id, and say so clearly if none has been set up yet.

1. **You (Super Admin) create the Warehouse Manager:** Users, **Invite user**, choose *Warehouse Manager*, enter their name and email, **Create invitation**.
2. **Give them the link** shown once (copy it; it can't be shown again: only a hash is stored). Send it privately (in person or a direct message). It is valid for 72 hours
   (`INVITATION_TTL_HOURS`, 1 hour to 14 days) and works once. **Nothing is emailed automatically: no mail service is configured.** Sending it by
   email later needs an SMTP/API provider (host, credentials and a sender address as new `.env` values, plus a small mail sender in the API): not built yet.
3. **The manager opens the link**, chooses a password (12+ characters, not a known default, not containing their email name) and can sign in with their email straight away.
4. **The manager invites branch users:** Users, Invite user, *Branch*, pick the branch, name and email. Same link step. They can also invite drivers.
5. **Lost or expired link?** Open the person's **Manage** dialog and choose *Resend (new link)* (the old link stops working) or *Revoke invitation*.

| Role | Can manage users | Sees and uses |
|---|---|---|
| Super Admin | Everyone: invites/edits/deactivates/reactivates warehouse managers, branch users, drivers; the only one who can create another Super Admin | Everything |
| Warehouse Manager | Branch users and drivers only (never Super Admins or other managers, not themselves); may assign branch users only to existing active branches | Inventory, products, branches, stock intake, requests, transfers, deliveries, documents, activity |
| Branch user | Nobody | Only their assigned branch: its requests, orders and receipts |
| Driver | Nobody | Only the delivery (transfers) functions; no stock requests, inventory or admin |

Rules the server enforces (not just the screen): roles are **fixed** once created (no promotion path); a person can't deactivate themselves; the last
usable Super Admin can never be deactivated; **deactivating someone ends all their sessions immediately** (as does *Sign out everywhere*); an invitee who
hasn't accepted can't sign in; inviting an address that already exists returns one generic message (no account is revealed). Every invitation, resend, revoke,
acceptance, deactivation, reactivation, branch move and sign-out is written to **Activity** (never a link or password). Emails are stored in lower case, and sign-in
ignores capital letters.

The older `POST /users` (admin-supplied initial password, forced change at first sign-in) still exists for scripts such as `scripts/setup-business-data.py`;
the app itself uses invitations.

### Password changes and resets

- **Changing your own password:** the key icon in the top bar (or `POST /auth/change-password`). It needs the current password, enforces
  the password policy (12+ characters, not a known default, not containing your email name, at most 72 bytes) and **signs out every
  other device**. A wrong current password returns 400 (not 401), so the app doesn't sign you out.
- **Someone forgot their password, or an account may be compromised:** an administrator opens **Users** in the sidebar and chooses
  **Reset password**, or calls `POST /users/<id>/reset-password`. This returns a **one-time reset code** (20 characters, 100 bits, valid
  60 minutes, single use, stored only as a SHA-256 hash). **The administrator never sees the user's new password.**
  - Starting a reset **immediately disables the old password and signs the user out everywhere**, so it also serves as incident response.
  - The admin gives the code (or the link, whose code sits after the `#` and is never sent to a server) to the user privately, in person or by
    a private message. It is shown once and can't be retrieved; if lost, reset again (a new code voids the old one).
  - The user opens **Sign in → "Have a reset code?"** (`/reset-password`), enters the code and chooses their own password.
- **Who can reset whom** is enforced by the server, not the UI: a `SUPER_ADMIN` can reset anyone but themselves (including another
  `SUPER_ADMIN`); a `WAREHOUSE_MANAGER` can reset only `BRANCH_USER` and `DRIVER` accounts, never a manager or an admin; branch users and
  drivers cannot reset anyone; nobody uses the admin reset on themselves; a deactivated account must be reactivated first.
- **Audit:** "issued a reset code for X", "completed a reset" and "changed their password" appear in **Activity** (never the code or a password).
- **Limits:** change and reset attempts are limited to 5 per minute per client IP, and every failed reset gives the identical generic message.
- **Not possible / by design:** there is no email or SMS delivery (the code is handed over by a person), no "forgot password" self-service
  without an administrator, and an admin cannot set a user's password directly. Resetting takes over the *login* of a lower-role account, which is
  why managers are limited to branch and driver accounts and every reset is audited.

### Break-glass: the only SUPER_ADMIN is locked out

Use this **only** when no administrator can sign in and reset the password from the app (the sole SUPER_ADMIN forgot it and there is no
second one). It is a command on the server's shell, with **no API endpoint and nothing reachable over the network**: whoever runs it
needs SSH access and Docker rights on the server, so guard those accordingly.

```bash
cd ~/durby-warehouse
sudo docker compose exec -e TARGET_EMAIL=admin@yourcompany.com backend npm run reset:admin-password   # no -T: it needs a terminal
```

What it does, and refuses to do:
- **Refuses** any command-line argument, a missing/non-lowercase `TARGET_EMAIL`, and any run without an interactive terminal. The new
  password is never taken from arguments or the environment, only typed at a hidden prompt (twice).
- **Refuses** (exit 3, nothing changed) unless `TARGET_EMAIL` is an **existing, active SUPER_ADMIN**. It never creates a user, changes a role,
  or reactivates an account.
- Shows `NODE_ENV`, the database name and host, and the account, then requires you to **type the database name and then the account's email**.
- The password must meet the normal policy (12+ characters, not a known default, not containing the email name, at most 72 bytes); three
  invalid attempts abort. It is hashed with the same bcrypt code as the app and never printed.
- In **one transaction** (row-locked, account re-checked at write time) it replaces the hash, **ends every existing session for that account**
  (`tokenVersion` + 1), discards its unused reset codes, and writes a `security` entry to **Activity** naming the account and the
  operating-system user and host that ran it (never a password or hash). If any step fails, none of it happens.
- Other administrators' sessions and every other account are untouched. The account is not forced to change the password again (the
  operator chose it); hand it over privately, and have its owner change it from the top bar.

Exit codes: `0` done; `1` aborted or failed, nothing changed; `2` bad usage/environment; `3` target refused; `130` cancelled.
Afterwards, check **Activity** for the "Break-glass password reset" entry, and consider whether the incident needs a wider review
(this command exists for lockouts, and equally shows who used shell access to take over an administrator account).

**5. Verify and back up (§6, §8).** Take and test-restore a backup *before* real data goes in.

### What NOT to do

- **Do not run `npm run seed` on a real deployment.** It creates demo users, branches and products, and resets
  their stock. In the production container it refuses: it exits with an error unless `ALLOW_DEMO_SEED=true`
  *and* a strong `SEED_DEMO_PASSWORD` are set, and even then it refuses any database that already holds
  non-demo data. Those switches exist only for a throwaway staging server; the public default password is
  never accepted in production.
- Do not run `bootstrap:admin` to "reset" anything. It only ever creates the first administrator.
- If a database was ever demo-seeded by mistake, don't try to clean it in place: drop it and start from step 2 (or restore a good backup).

### Product images are not part of V1

The product-image feature (Open Food Facts lookup, image upload/approval, thumbnails) was removed: products are shown without images.
Nothing here needs setup or backfilling. The database keeps an **empty, unused `ProductImage` table** (and its enum): dropping it
would be a destructive migration with no benefit at launch, so it was deliberately left in place. It can be removed later in a
dedicated migration if the feature is never coming back. `Product.barcode` is kept: invoice lines are matched to products by SKU or barcode.

## 6. Verify

```bash
curl -s https://<API_DOMAIN>/api/health          # {"status":"ok", database up, redis up}
curl -sI https://<FRONTEND_DOMAIN> | head -3      # HTTP/2 200 with a valid Let's Encrypt certificate
```

If a certificate isn't issued, check `sudo docker compose logs reverse-proxy`. It is almost always DNS that
hasn't propagated, or port 80 not reachable.

Security checks worth doing once after the first deploy:

```bash
# Nothing but 22/80/443 listening publicly:
ss -tlnp | grep -v 127.0.0
# The shipped JavaScript must not contain demo credentials (want: 0 and 0):
sudo docker compose exec frontend sh -c "grep -rlF 'ChangeMe123' /usr/share/nginx/html | wc -l; grep -rli 'demo accounts' /usr/share/nginx/html | wc -l"
# Login page shows no "Demo accounts" list; a wrong-password login returns 401, and the 6th in a minute returns 429.
```

### Rate limiting and the reverse proxy

Login is limited to 5 attempts/minute and everything else to 120 requests/minute, **per client IP**.
The API only believes `X-Forwarded-For` from Caddy: `docker-compose.yml` pins the `internal` network
(`172.28.0.0/24`), gives Caddy the fixed address `172.28.0.10`, and sets `TRUST_PROXY=172.28.0.10` on the
backend. Consequences:

- Keep the `reverse-proxy` `ipv4_address` and the backend's `TRUST_PROXY` identical.
- `TRUST_PROXY` accepts only literal IPs/CIDRs (never `true`, hop counts or `/0`); unset means "trust
  nothing" and the direct peer's address is used.
- If `172.28.0.0/24` collides with another network on your host, change the subnet, the fixed address and
  `TRUST_PROXY` together.
- After changing Compose network settings on an already-running stack, run
  `sudo docker compose up -d --force-recreate` (data volumes are kept); otherwise service names may
  stop resolving until the containers are recreated.

## 7. OCR (scanned invoices)

`apps/ocr` (PaddleOCR) is only called when an uploaded PDF has no usable text layer. It runs
`linux/amd64`, which is native on this server. **Successful OCR inference has never been verified**:
it crashed or hung under Apple Silicon emulation during development. After the first deploy, upload a
scanned invoice PDF on the Stock Intake screen and confirm text comes back. If OCR fails or times out (90 s)
the upload is refused with a clean message and nothing is created, and CSV/XLSX and text PDFs are unaffected.
Two properties to know: while an OCR request runs, the OCR container's `/health` may not respond
(the container can show "unhealthy" but is not restarted), and scans are processed one at a time.

## 8. Back up and restore Postgres

```bash
./scripts/backup-db.sh                         # ./backups/durby-warehouse-<timestamp>.sql.gz, keeps the last 14
./scripts/restore-db.sh ./backups/durby-warehouse-<timestamp>.sql.gz
```

(Run with `sudo` if your user can't use Docker. The scripts read `.env`.)

**What a backup contains, and what it doesn't**

- It is a `pg_dump` of the application database only: all business data, and every user's **bcrypt password hash**. It contains **none of the `.env` secrets** (no `POSTGRES_PASSWORD`, `JWT_SECRET` or
  `REDIS_PASSWORD`; checked). Redis isn't backed up; it only holds job queues and rate-limit counters.
- Because it holds real data and password hashes, backups are created private (files `600`, a new `backups/` directory `700`) and
  `backups/` is git-ignored. Treat every copy as sensitive, and encrypt it if it leaves the server.
- Keep `.env` in your password manager separately; it is not in the backup, and you need it to bring the stack up.

Daily cron on the server (`sudo crontab -e`; adjust the path):

```
0 3 * * * cd /home/yuvanesh/durby-warehouse && ./scripts/backup-db.sh >> /var/log/durby-backup.log 2>&1
```

**Copy backups off the server** (rsync/rclone to another machine or object storage): a backup on the same
disk as the database doesn't survive losing the server.

**Restoring into a fresh production database** (server lost or rebuilt) works on a brand-new, empty database, since
the dump carries the schema, the migration history and the document-number counters, so `REQ-`/`OC-` numbering continues where
it left off. Order:

1. Bring up the stack on the new server: prepare `.env` as in §4, then `docker compose up -d --build` (§5 step 1).
   A new `POSTGRES_PASSWORD` is fine; it initializes the new volume. Wait for it to be healthy.
2. **Do not** run `bootstrap:admin` or the seed. Your users come from the backup.
3. `./scripts/restore-db.sh <backup>` (type the database name to confirm).
4. `sudo docker compose exec backend npx prisma migrate deploy` (applies any migrations newer than the backup; no-op otherwise),
   then `sudo docker compose restart backend worker`.
5. If `JWT_SECRET` differs from the old server, everyone simply has to log in again.

`restore-db.sh` is **destructive** (it replaces the live database, and asks you to type the database name). It's
all-or-nothing: it runs in a single transaction and stops at the first SQL error, so a corrupt or truncated backup fails loudly and leaves
the current database untouched rather than half-restored.

To prove a backup is usable **without touching live data**, restore it into a scratch database and compare:

```bash
set -a; . ./.env; set +a
sudo docker compose exec -T postgres createdb -U "$POSTGRES_USER" restore_test
gunzip -c backups/<file>.sql.gz | sudo docker compose exec -T postgres psql -U "$POSTGRES_USER" -d restore_test -q -v ON_ERROR_STOP=1 --single-transaction
sudo docker compose exec -T postgres psql -U "$POSTGRES_USER" -d restore_test -c 'select count(*) from "Product"'
sudo docker compose exec -T postgres dropdb -U "$POSTGRES_USER" restore_test
```

Do this once before relying on the backups, and again occasionally.

## 9. Updating

```bash
cd durby-warehouse && git pull
sudo docker compose build
# Apply migrations FIRST, from the new image, while the old containers keep serving. Migrations are additive, so the old code ignores new
# columns; starting the new code before its migration would make authenticated requests fail until the migration runs.
sudo docker compose run --rm --no-deps backend npx prisma migrate deploy
sudo docker compose up -d
```

## Known limitations

- **No location or category screens.** These are done through the API (§5, step 4). People are invited and managed on the **Users** screen. Invitation links are
  shown to the inviter to hand over; they are not emailed (no mail service is configured). Keep a second `SUPER_ADMIN` as the recovery path (the server-shell break-glass command in §5 is the last resort).
- **Password reset needs an administrator** and a private handover of the one-time code (no email/SMS). Reset codes last 60 minutes.
- **Manager screens poll rather than push** (~15 s cache). The backend's locking, not the UI, prevents
  double-approval, so this is only a refresh-speed note.
- **OCR inference is unverified on real hardware** (see §7).
- **The demo seed is for local development only** and fails closed in production (§5).

Verified against the real Dockerized stack locally (`docker compose up -d --build`, migrated + seeded Postgres,
real Redis): the full branch → manager → driver → delivery → confirm-receipt workflow, partial approval, partial
picking with a discrepancy, and the two-manager concurrent-approval race (exactly one wins, one gets `409`).
