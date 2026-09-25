#!/bin/bash
# Zips wiki.db (via SQLite safe backup) + uploads on a schedule, keeps BACKUP_KEEP newest.
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
DB_PATH=${WIKI_DB_PATH:-/app/data/wiki.db}
UPLOAD_DIR="$(dirname "$DB_PATH")/uploads"
KEEP=${BACKUP_KEEP:-14}
INTERVAL=${BACKUP_INTERVAL:-86400}

mkdir -p "$BACKUP_DIR"

while true; do
    ts=$(date +%Y-%m-%d_%H%M%S)
    out="$BACKUP_DIR/family-wiki-backup-$ts.zip"
    tmp="$out.part"

    if [ ! -f "$DB_PATH" ]; then
        echo "[backup] $ts: database not found at $DB_PATH, waiting..."
    else
        # consistent snapshot via sqlite3 .backup, then zip with uploads
        if sqlite3 "$DB_PATH" ".backup '/tmp/wiki-snapshot.db'"; then
            ( cd "$(dirname "$DB_PATH")" \
              && mkdir -p /tmp/uploads-copy \
              && cp -r "$(basename "$UPLOAD_DIR")/." /tmp/uploads-copy/ 2>/dev/null || true \
              && zip -q -r "$tmp" -j /tmp/wiki-snapshot.db -x '*.backup-tmp' \
              && cd /tmp/uploads-copy 2>/dev/null && zip -q -r "$tmp" . -x '.*' >/dev/null 2>&1 || true )
            mv "$tmp" "$out"
            echo "[backup] $ts: wrote $out ($(du -h "$out" | cut -f1))"
        else
            echo "[backup] $ts: sqlite3 backup FAILED" >&2
        fi
    fi

    # prune old backups (keep newest $KEEP)
    ls -1t "$BACKUP_DIR"/family-wiki-backup-*.zip 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

    sleep "$INTERVAL"
done
