#!/bin/bash
# Sidecar backup for Family Wiki.
#
# Every BACKUP_INTERVAL seconds, writes to $BACKUP_DIR:
#   family-wiki-<timestamp>.db    - consistent SQLite snapshot (via sqlite3 .backup)
#   family-wiki-<timestamp>.json  - all pages + revisions as JSON (portable, human readable)
#   family-wiki-uploads-<timestamp>.zip - uploaded images (only if any exist)
#
# Keeps the newest BACKUP_KEEP of each type; prunes the rest.
# Config lives in .env (see .env.example).
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
DB_PATH=${WIKI_DB_PATH:-/app/data/wiki.db}
KEEP=${BACKUP_KEEP:-14}
INTERVAL=${BACKUP_INTERVAL:-86400}
UPLOAD_DIR="$(dirname "$DB_PATH")/uploads"

mkdir -p "$BACKUP_DIR"

write_json() {
    local out="$1"
    local pages revisions
    pages=$(sqlite3 -json "$DB_PATH" "SELECT * FROM pages")
    revisions=$(sqlite3 -json "$DB_PATH" "SELECT * FROM revisions")
    {
        printf '{"pages":'
        if [ -n "$pages" ]; then echo "$pages"; else echo '[]'; fi
        printf ',"revisions":'
        if [ -n "$revisions" ]; then echo "$revisions"; else echo '[]'; fi
        printf '}'
    } > "$out"
}

while true; do
    ts=$(date +%Y-%m-%d_%H%M%S)
    out_base="$BACKUP_DIR/family-wiki-$ts"

    if [ ! -f "$DB_PATH" ]; then
        echo "[backup] $ts: database not found at $DB_PATH, waiting..."
    else
        # 1) consistent .db snapshot
        if sqlite3 "$DB_PATH" ".backup '/tmp/wiki-snapshot.db'"; then
            mv /tmp/wiki-snapshot.db "$out_base.db"
            echo "[backup] $ts: wrote $out_base.db ($(du -h "$out_base.db" | cut -f1))"
        else
            echo "[backup] $ts: sqlite3 .backup FAILED" >&2
        fi

        # 2) .json export (portable, human readable)
        if write_json "$out_base.json"; then
            echo "[backup] $ts: wrote $out_base.json ($(du -h "$out_base.json" | cut -f1))"
        else
            echo "[backup] $ts: json export FAILED" >&2
        fi

        # 3) uploads, only if any
        if [ -d "$UPLOAD_DIR" ] && [ -n "$(ls -A "$UPLOAD_DIR" 2>/dev/null)" ]; then
            zip -q -j "$BACKUP_DIR/family-wiki-uploads-$ts.zip" "$UPLOAD_DIR"/* 2>/dev/null || true
        fi
    fi

    # prune: keep newest $KEEP of each type
    for pat in 'family-wiki-????-??-??_*.db' 'family-wiki-????-??-??_*.json' 'family-wiki-uploads-*.zip'; do
        ls -1t "$BACKUP_DIR"/$pat 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
    done

    sleep "$INTERVAL"
done
