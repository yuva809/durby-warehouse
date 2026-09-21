# Durby Warehouse

One central warehouse supplying five grocery branches: stock requests,
warehouse review/approval, transfers, and driver delivery, connected in one
live flow.

## Layout

```
apps/web/    React + Vite frontend (V1 UI — see apps/web/README.md)
apps/api/    NestJS + PostgreSQL + Redis backend (V2)
infra/       Caddy reverse-proxy config
scripts/     DB backup/restore, end-to-end smoke test
docker-compose.yml   The whole stack: reverse-proxy, frontend, backend, worker, postgres, redis
DEPLOY.md    How to run this locally and on a Hetzner VPS
```

## Quick start

```bash
cp .env.example .env      # edit values
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

Frontend: http://localhost — API: http://api.localhost/api/health

See **[DEPLOY.md](./DEPLOY.md)** for the full local-dev and Hetzner CPX22
deployment walkthrough, backups, and current known limitations (most
importantly: the frontend container serves the V1 UI as-is — it is not yet
wired to call this API, that's the next increment).

## Status

V1 was a frontend-only demo prototype (Zustand + localStorage, no backend).
V2 is a real backend being built on top of it: PostgreSQL-backed inventory
with a proper reserve/pick ledger and transactional concurrency safety, JWT
auth with server-enforced roles, and the same request → approve → transfer →
deliver → confirm workflow V1 proved out. See the project status report for
the current build (schema, endpoints, what's tested vs. not yet run against
a live database, and what's next).
