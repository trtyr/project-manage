#!/usr/bin/env bash
# Backup project-manage PostgreSQL database to a local SQL file.
#
# The database lives in the `pgdata` Docker named volume (inside OrbStack's
# VM). This script exports it to `backups/` in the repo root so the data is
# always recoverable to a plain SQL file on the host filesystem.
#
# Usage:
#   ./scripts/db-backup.sh           # → backups/project_manage_<timestamp>.sql
#
# Restore:
#   docker compose exec -T db psql -U project_manage -d project_manage \
#     < backups/project_manage_<timestamp>.sql

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${REPO_ROOT}/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT="${BACKUP_DIR}/project_manage_${TIMESTAMP}.sql"

mkdir -p "$BACKUP_DIR"

cd "$REPO_ROOT"
echo "→ backing up database to ${OUT}"

docker compose exec -T db \
  pg_dump -U project_manage -d project_manage --clean --if-exists --no-owner \
  > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "✓ backup complete: ${OUT} (${SIZE})"
echo "  restore with:"
echo "    docker compose exec -T db psql -U project_manage -d project_manage < ${OUT}"
