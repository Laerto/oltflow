#!/usr/bin/env bash
# OLTFlow restore / migrate-to-new-server runbook helper.
#
# Usage:
#   ./scripts/restore.sh /path/to/backup-run-dir
#   ./scripts/restore.sh /path/to/oltflow-backup-....tar.gz
#
# Expects either:
#   - a run directory containing database.dump + config/ + manifest.json
#   - or a .tar.gz produced by the backup worker
#
# Safety: refuses to run if DESTROY_DB is not set to YES (prevents accidents).
set -euo pipefail

BACKUP_SRC="${1:-}"
if [[ -z "$BACKUP_SRC" ]]; then
  echo "Usage: $0 <backup-run-dir|oltflow-backup-*.tar.gz>"
  exit 1
fi

if [[ "${DESTROY_DB:-}" != "YES" ]]; then
  echo "Refusing to restore: set DESTROY_DB=YES to confirm you want to overwrite the database."
  echo ""
  echo "Example:"
  echo "  DESTROY_DB=YES DATABASE_URL=postgresql://... $0 $BACKUP_SRC"
  exit 2
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

if [[ -f "$BACKUP_SRC" && "$BACKUP_SRC" == *.tar.gz ]]; then
  echo "→ Extracting archive…"
  tar -xzf "$BACKUP_SRC" -C "$WORKDIR"
  DUMP="$WORKDIR/database.dump"
  CONFIG="$WORKDIR/config"
  MANIFEST="$WORKDIR/manifest.json"
elif [[ -d "$BACKUP_SRC" ]]; then
  DUMP="$BACKUP_SRC/database.dump"
  CONFIG="$BACKUP_SRC/config"
  MANIFEST="$BACKUP_SRC/manifest.json"
else
  echo "Not a file or directory: $BACKUP_SRC"
  exit 1
fi

if [[ ! -f "$DUMP" ]]; then
  echo "database.dump not found in backup"
  exit 1
fi

if [[ -f "$MANIFEST" ]]; then
  echo "→ Manifest:"
  cat "$MANIFEST"
  echo ""
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a; source .env; set +a
  fi
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not set"
  exit 1
fi

# Parse postgres URL (basic)
# postgresql://user:pass@host:port/db
proto_removed="${DATABASE_URL#postgresql://}"
proto_removed="${proto_removed#postgres://}"
userpass="${proto_removed%%@*}"
hostportdb="${proto_removed#*@}"
PGUSER="${userpass%%:*}"
PGPASSWORD="${userpass#*:}"
hostport="${hostportdb%%/*}"
PGHOST="${hostport%%:*}"
PGPORT="${hostport##*:}"
[[ "$PGPORT" == "$PGHOST" ]] && PGPORT=5432
PGDATABASE="${hostportdb#*/}"
PGDATABASE="${PGDATABASE%%\?*}"
export PGPASSWORD

echo "→ Restoring into $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
echo "→ This will DROP and recreate public schema objects (custom-format restore with --clean)"

pg_restore \
  --clean --if-exists \
  --no-owner --no-acl \
  -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  "$DUMP"

echo "→ Database restore finished."

if [[ -d "$CONFIG" ]]; then
  echo "→ Config snapshot available at: $CONFIG"
  echo "  - settings.json, integrations.json (re-import via admin if needed)"
  echo "  - .env / docker-compose.yml (review and merge carefully — do not blindly overwrite secrets)"
fi

echo ""
echo "Next steps:"
echo "  1. cd /path/to/oltflow && docker compose up -d"
echo "  2. npx prisma migrate deploy   # if migrating across app versions"
echo "  3. Log in as admin and verify Integrations + Settings"
echo "Done."
