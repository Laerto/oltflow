# OLTFlow — Backup & migration runbook

## What a backup contains

Each run directory under `BACKUP_DIR` (default `/var/lib/oltflow/backups/runs/<timestamp>/`):

| File | Description |
|---|---|
| `database.dump` | `pg_dump -Fc` custom-format Postgres dump |
| `config/settings.json` | DB-backed runtime settings |
| `config/integrations.json` | Integration rows (config still AES-encrypted) |
| `config/.env` | Snapshot of `.env` if mounted into worker |
| `config/docker-compose.yml` | Snapshot of compose file if mounted |
| `manifest.json` | Version, migration id, sizes, SHA-256 of dump |
| `oltflow-backup-*.tar.gz` | Bundle of the above for SCP / archive |

## Taking a backup

### From the UI

1. **Admin → Backup**
2. Create a **Local** or **SSH** target (optional; “Backup tani” works without a target)
3. Click **Backup tani** or wait for the schedule (`daily:03:00` UTC, or `weekly:sun:03:00`)
4. Open a run → **Verify** (checksum + `pg_restore -l`)

### From the API

```bash
curl -X POST https://noc.example.com/api/admin/backup/runs \
  -H 'Cookie: oltflow_session=…' \
  -H 'Content-Type: application/json' \
  -d '{"targetId":1}'
```

## Host layout (docker compose)

Worker mounts:

```yaml
BACKUP_DIR=/var/lib/oltflow/backups
./data/backups → /var/lib/oltflow/backups
./.env → /app/.env.backup:ro
./docker-compose.yml → /app/docker-compose.yml.backup:ro
```

Rebuild the worker image after Phase 5 so `pg_dump` / `scp` packages are present:

```bash
docker compose build worker && docker compose up -d worker
```

## Restore (CLI only — intentional)

Restore is **destructive** and never exposed as a web button.

```bash
# 1) Fresh server: install docker, clone repo, copy .env
git clone … oltflow && cd oltflow
cp /secure/path/.env .

# 2) Copy a backup run dir or tar.gz onto the server
scp -r oltflow-backup-….tar.gz user@new-server:/tmp/

# 3) Start Postgres only (or full stack)
docker compose up -d postgres
# wait for healthy

# 4) Restore
export DATABASE_URL=postgresql://oltpanel:…@127.0.0.1:5433/oltpanel
DESTROY_DB=YES ./scripts/restore.sh /tmp/oltflow-backup-….tar.gz

# 5) Bring the app up + apply any newer migrations
docker compose up -d
docker compose exec web npx prisma migrate deploy -w packages/db
```

### Verify without restore

From **Admin → Backup → Verify**, or on disk:

```bash
sha256sum /var/lib/oltflow/backups/runs/…/oltflow-backup-*.tar.gz
pg_restore -l /var/lib/oltflow/backups/runs/…/database.dump | head
```

## Migration to another server (checklist)

1. On old server: run a fresh backup; copy `tar.gz` + note `manifest.json` migration id  
2. On new server: clone same (or newer) app version  
3. Restore dump  
4. `prisma migrate deploy` if app is newer than backup schema  
5. Re-check Integrations (Telegram/SMTP tokens) and `APP_BASE_URL`  
6. Point DNS / nginx at the new host  

## Notifications

Seeded rules fire Telegram (if configured) on:

- `backup.completed`
- `backup.failed`

Edit under **Admin → Integrime → Rregullat**.

## Retention

Per-target `retention.keepLast` (default 7). After each success the worker deletes older successful runs for that target (files + DB rows).
