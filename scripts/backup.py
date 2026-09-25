#!/usr/bin/env python3
"""
Family Wiki - Dual Format Automated Backup Runner
Creates per-run snapshot folders in BACKUP_DIR:
  snapshot_<timestamp>/
    wiki.db          SQLite binary snapshot (safe online backup)
    data_export.json Full pages + revisions export (portable)
    uploads/         copied uploaded images (if any)
    checksum.sha256  SHA-256 integrity checksums
Also maintains latest.json at the top of BACKUP_DIR.
Prunes snapshots older than RETENTION_DAYS.
"""
import os
import sys
import time
import json
import sqlite3
import hashlib
import shutil
from datetime import datetime

DB_PATH = os.environ.get('DB_PATH', '/app/data/wiki.db')
UPLOAD_DIR = os.environ.get('UPLOAD_DIR') or os.path.join(os.path.dirname(DB_PATH), 'uploads')
BACKUP_DIR = os.environ.get('BACKUP_DIR', '/backups')
RETENTION_DAYS = int(os.environ.get('RETENTION_DAYS', 30))

def run_backup():
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting backup process...")

    if not os.path.exists(DB_PATH):
        print(f"Warning: Database file not found at {DB_PATH}. Skipping.")
        return False

    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    snapshot_dir = os.path.join(BACKUP_DIR, f"snapshot_{timestamp}")
    os.makedirs(snapshot_dir, exist_ok=True)

    # 1. Safe SQLite Online Backup
    db_backup_file = os.path.join(snapshot_dir, "wiki.db")
    try:
        src = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
        dst = sqlite3.connect(db_backup_file)
        with dst:
            src.backup(dst)
        dst.close()
        src.close()
        print(f"  SQLite binary snapshot created: {db_backup_file}")
    except Exception as e:
        print(f"  SQLite backup error: {e}")
        return False

    # 2. JSON export from the snapshot (consistent by construction)
    try:
        conn = sqlite3.connect(db_backup_file)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        pages = [dict(r) for r in cursor.execute('SELECT * FROM pages ORDER BY id ASC').fetchall()]
        revisions = [dict(r) for r in cursor.execute('SELECT * FROM revisions ORDER BY id ASC').fetchall()]
        conn.close()

        json_data = {
            "metadata": {
                "version": "1.0",
                "exported_at": datetime.now().isoformat(),
                "generator": "Family Wiki Automated Sidecar",
                "total_pages": len(pages),
                "total_revisions": len(revisions)
            },
            "pages": pages,
            "revisions": revisions
        }
        with open(os.path.join(snapshot_dir, "data_export.json"), 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=2)
        print(f"  JSON data export created")
        with open(os.path.join(BACKUP_DIR, "latest.json"), 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=2)
    except Exception as e:
        print(f"  JSON export error: {e}")

    # 3. Copy uploads (images etc.), if any
    try:
        if os.path.isdir(UPLOAD_DIR) and os.listdir(UPLOAD_DIR):
            dest_uploads = os.path.join(snapshot_dir, "uploads")
            shutil.copytree(UPLOAD_DIR, dest_uploads)
            print(f"  Uploads copied ({len(os.listdir(dest_uploads))} file(s)).")
    except Exception as e:
        print(f"  Uploads copy error: {e}")

    # 4. Checksums
    try:
        with open(os.path.join(snapshot_dir, "checksum.sha256"), 'w', encoding='utf-8') as cf:
            for fname in ["wiki.db", "data_export.json"]:
                fpath = os.path.join(snapshot_dir, fname)
                if os.path.exists(fpath):
                    hasher = hashlib.sha256()
                    with open(fpath, 'rb') as f:
                        while chunk := f.read(8192):
                            hasher.update(chunk)
                    cf.write(f"{hasher.hexdigest()}  {fname}\n")
        print("  SHA-256 checksums recorded.")
    except Exception as e:
        print(f"  Checksum calculation error: {e}")

    # 5. Retention Pruning
    now = datetime.now()
    pruned = 0
    try:
        for entry in os.scandir(BACKUP_DIR):
            if entry.is_dir() and entry.name.startswith("snapshot_"):
                mtime = datetime.fromtimestamp(entry.stat().st_mtime)
                if (now - mtime).days > RETENTION_DAYS:
                    shutil.rmtree(entry.path, ignore_errors=True)
                    pruned += 1
        if pruned > 0:
            print(f"  Pruned {pruned} old snapshot(s) (> {RETENTION_DAYS} days).")
    except Exception as e:
        print(f"  Pruning error: {e}")

    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Backup finished successfully.")
    return True

def daemon_loop():
    interval_hours = float(os.environ.get('BACKUP_INTERVAL_HOURS', '24'))
    print(f"Starting Family Wiki Backup Sidecar Daemon (interval: every {interval_hours} hours, retention: {RETENTION_DAYS} days)...")
    run_backup()
    while True:
        try:
            time.sleep(float(interval_hours) * 3600)
            run_backup()
        except (KeyboardInterrupt, SystemExit):
            print("Backup daemon stopped.")
            break

if __name__ == '__main__':
    if '--once' in sys.argv or os.environ.get('RUN_ONCE') == '1':
        sys.exit(0 if run_backup() else 1)
    daemon_loop()
