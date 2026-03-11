#!/usr/bin/env bash
#
# AdPilot Database Backup Script
#
# Usage:  ./scripts/backup.sh
# Env:    DATABASE_URL — Postgres connection string
#         BACKUP_DIR   — directory for backups (default: ./backups)
#         RETENTION_DAYS — days to keep old backups (default: 30)
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/adpilot_${TIMESTAMP}.sql.gz"

# Parse DATABASE_URL into components
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[ERROR] DATABASE_URL is not set"
  exit 1
fi

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] Starting backup..."

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------

pg_dump "${DATABASE_URL}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --verbose \
  2>&1 | gzip > "${BACKUP_FILE}"

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date -Iseconds)] Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ---------------------------------------------------------------------------
# Retention — remove backups older than RETENTION_DAYS
# ---------------------------------------------------------------------------

echo "[$(date -Iseconds)] Cleaning backups older than ${RETENTION_DAYS} days..."
DELETED=$(find "${BACKUP_DIR}" -name "adpilot_*.sql.gz" -mtime +${RETENTION_DAYS} -print -delete | wc -l)
echo "[$(date -Iseconds)] Removed ${DELETED} old backup(s)"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

REMAINING=$(find "${BACKUP_DIR}" -name "adpilot_*.sql.gz" | wc -l)
echo "[$(date -Iseconds)] Backup complete. ${REMAINING} backup(s) on disk."
echo "[$(date -Iseconds)] Done."
