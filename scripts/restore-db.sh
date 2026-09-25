#!/usr/bin/env bash
# Restores a backup produced by backup-db.sh into the running `postgres`
# container. DESTRUCTIVE — this replaces the current database contents.
#
# Usage: ./scripts/restore-db.sh path/to/durby-warehouse-<timestamp>.sql.gz
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FILE="${1:?Usage: restore-db.sh path/to/backup.sql.gz}"

# shellcheck disable=SC1091
[ -f "$ROOT_DIR/.env" ] && source "$ROOT_DIR/.env"
: "${POSTGRES_USER:?Set POSTGRES_USER in .env}"
: "${POSTGRES_DB:?Set POSTGRES_DB in .env}"

if [ ! -f "$FILE" ]; then
  echo "No such file: $FILE" >&2
  exit 1
fi

echo "This will REPLACE the current contents of database '$POSTGRES_DB'."
read -r -p "Type the database name to confirm: " CONFIRM
if [ "$CONFIRM" != "$POSTGRES_DB" ]; then
  echo "Confirmation did not match — aborting."
  exit 1
fi

echo "Restoring $FILE into $POSTGRES_DB ..."
# All-or-nothing: --single-transaction plus ON_ERROR_STOP means any SQL error
# aborts and rolls back the whole restore, instead of leaving a half-restored
# database that the app would then run against.
gunzip -c "$FILE" | docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -v ON_ERROR_STOP=1 --single-transaction

echo "Restore complete. Restart the app services so they pick up any schema changes:"
echo "  docker compose -f \"$ROOT_DIR/docker-compose.yml\" restart backend worker"
