#!/usr/bin/env bash
# Dumps the Postgres database from the running `postgres` container to a
# timestamped, gzip-compressed file. Safe to run on a cron on the Hetzner box —
# see infra notes in DEPLOY.md for a suggested schedule.
#
# Usage: ./scripts/backup-db.sh [output-dir]   (default: ./backups)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/backups}"

# shellcheck disable=SC1091
[ -f "$ROOT_DIR/.env" ] && source "$ROOT_DIR/.env"
: "${POSTGRES_USER:?Set POSTGRES_USER in .env}"
: "${POSTGRES_DB:?Set POSTGRES_DB in .env}"

mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/durby-warehouse-$STAMP.sql.gz"

echo "Backing up $POSTGRES_DB to $FILE ..."
docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip > "$FILE"

echo "Done: $FILE ($(du -h "$FILE" | cut -f1))"

# Keep the last 14 backups, prune the rest. Adjust to taste.
ls -1t "$OUT_DIR"/durby-warehouse-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
