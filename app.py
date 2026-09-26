import os
import sqlite3
import re
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, render_template, send_from_directory, send_file
import uuid
import json
import shutil
import hashlib
import tempfile

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("WIKI_DB_PATH", BASE_DIR / "data" / "wiki.db"))
UPLOAD_DIR = DB_PATH.parent / "uploads"
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL UNIQUE,
            slug TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL DEFAULT 'Uncategorized',
            tags TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            author TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS revisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            author TEXT NOT NULL DEFAULT '',
            saved_at TEXT NOT NULL
        );
        """
    )
    db.commit()

    # Seed or update starter Welcome page
    cur = db.execute("SELECT COUNT(*) FROM pages")
    now = datetime.now(timezone.utc).isoformat()
    if cur.fetchone()[0] == 0:
        db.execute(
            """INSERT INTO pages (title, slug, category, tags, content, author, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "Welcome",
                "welcome",
                "Home",
                "guide",
                "# Welcome to the Family Wiki\n\n"
                "This is your family's own record book. A few things you can do:\n\n"
                "- Create a page for a recipe, a story, a relative, or a house you lived in\n"
                "- Organize pages into categories using the sidebar\n"
                "- Link to another page by writing its title in double brackets, "
                "like [[Grandma's Kitchen]]\n"
                "- Upload photos to pages using the **📷 Upload Image** button, drag & drop, or pasting (`Ctrl+V` / `Cmd+V`)\n"
                "- Toggle light or dark mode anytime with the 🌙/☀️ button in the top bar\n"
                "- Search everything from the top bar\n\n"
                "Start by clicking **+ New Page**.",
                "The Wiki",
                now,
                now,
            ),
        )
        db.commit()
    else:
        # Update existing welcome page if present so photo upload instructions appear
        cur = db.execute("SELECT id, content FROM pages WHERE slug = 'welcome'")
        row = cur.fetchone()
        if row and "Upload photos" not in row["content"]:
            new_content = row["content"].replace(
                "- Search everything from the top bar",
                "- Upload photos to pages using the **📷 Upload Image** button, drag & drop, or pasting (`Ctrl+V` / `Cmd+V`)\n"
                "- Toggle light or dark mode anytime with the 🌙/☀️ button in the top bar\n"
                "- Search everything from the top bar"
            )
            db.execute("UPDATE pages SET content = ? WHERE id = ?", (new_content, row["id"]))
            db.commit()
    db.close()


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.strip().lower()).strip("-")
    return slug or "page"


def unique_slug(db, title: str, exclude_id=None) -> str:
    base = slugify(title)
    slug = base
    i = 2
    while True:
        if exclude_id is not None:
            row = db.execute(
                "SELECT id FROM pages WHERE slug = ? AND id != ?", (slug, exclude_id)
            ).fetchone()
        else:
            row = db.execute("SELECT id FROM pages WHERE slug = ?", (slug,)).fetchone()
        if row is None:
            return slug
        slug = f"{base}-{i}"
        i += 1


def page_to_dict(row, include_content=True):
    d = {
        "id": row["id"],
        "title": row["title"],
        "slug": row["slug"],
        "category": row["category"],
        "tags": [t for t in row["tags"].split(",") if t],
        "author": row["author"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
    if include_content:
        d["content"] = row["content"]
    return d


def normalize_tags(raw_tags):
    if not raw_tags:
        return ""
    if isinstance(raw_tags, str):
        items = raw_tags.split(",")
    elif isinstance(raw_tags, (list, tuple)):
        items = raw_tags
    else:
        return ""
    return ",".join(t.strip() for t in items if isinstance(t, str) and t.strip())


# ---------------------------------------------------------------------------
# Page routes (HTML shell)
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------------------
# API: pages
# ---------------------------------------------------------------------------

@app.route("/api/pages", methods=["GET"])
def list_pages():
    db = get_db()
    rows = db.execute("SELECT * FROM pages ORDER BY updated_at DESC").fetchall()
    return jsonify([page_to_dict(r, include_content=False) for r in rows])


@app.route("/api/pages/<int:page_id>", methods=["GET"])
def get_page(page_id):
    db = get_db()
    row = db.execute("SELECT * FROM pages WHERE id = ?", (page_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Page not found"}), 404
    return jsonify(page_to_dict(row))


@app.route("/api/pages", methods=["POST"])
def create_page():
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Title is required"}), 400

    db = get_db()
    existing = db.execute("SELECT id FROM pages WHERE title = ?", (title,)).fetchone()
    if existing:
        return jsonify({"error": "A page with that title already exists"}), 409

    slug = unique_slug(db, title)
    category = (data.get("category") or "Uncategorized").strip() or "Uncategorized"
    tags = normalize_tags(data.get("tags"))
    content = data.get("content") or ""
    author = (data.get("author") or "").strip()
    now = datetime.now(timezone.utc).isoformat()

    cur = db.execute(
        """INSERT INTO pages (title, slug, category, tags, content, author, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (title, slug, category, tags, content, author, now, now),
    )
    db.execute(
        "INSERT INTO revisions (page_id, title, content, author, saved_at) VALUES (?, ?, ?, ?, ?)",
        (cur.lastrowid, title, content, author, now),
    )
    db.commit()
    row = db.execute("SELECT * FROM pages WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(page_to_dict(row)), 201


@app.route("/api/pages/<int:page_id>", methods=["PUT"])
def update_page(page_id):
    db = get_db()
    row = db.execute("SELECT * FROM pages WHERE id = ?", (page_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Page not found"}), 404

    data = request.get_json(force=True) or {}
    
    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "Title is required"}), 400
    else:
        title = row["title"]

    dupe = db.execute(
        "SELECT id FROM pages WHERE title = ? AND id != ?", (title, page_id)
    ).fetchone()
    if dupe:
        return jsonify({"error": "A page with that title already exists"}), 409

    slug = row["slug"] if title == row["title"] else unique_slug(db, title, exclude_id=page_id)
    category = data["category"].strip() if "category" in data and data["category"] is not None else row["category"]
    if not category:
        category = "Uncategorized"
        
    if "tags" in data and data["tags"] is not None:
        tags = normalize_tags(data["tags"])
    else:
        tags = row["tags"]

    content = data["content"] if "content" in data and data["content"] is not None else row["content"]
    author = data["author"].strip() if "author" in data and data["author"] is not None else row["author"]
    now = datetime.now(timezone.utc).isoformat()

    db.execute(
        """UPDATE pages SET title=?, slug=?, category=?, tags=?, content=?, author=?, updated_at=?
           WHERE id=?""",
        (title, slug, category, tags, content, author, now, page_id),
    )
    db.execute(
        "INSERT INTO revisions (page_id, title, content, author, saved_at) VALUES (?, ?, ?, ?, ?)",
        (page_id, title, content, author, now),
    )
    db.commit()
    row = db.execute("SELECT * FROM pages WHERE id = ?", (page_id,)).fetchone()
    return jsonify(page_to_dict(row))


@app.route("/api/pages/<int:page_id>", methods=["DELETE"])
def delete_page(page_id):
    db = get_db()
    row = db.execute("SELECT id FROM pages WHERE id = ?", (page_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Page not found"}), 404
    db.execute("DELETE FROM pages WHERE id = ?", (page_id,))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/pages/<int:page_id>/history", methods=["GET"])
def page_history(page_id):
    db = get_db()
    rows = db.execute(
        "SELECT id, title, author, saved_at FROM revisions WHERE page_id = ? ORDER BY saved_at DESC",
        (page_id,),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


# ---------------------------------------------------------------------------
# API: categories & search
# ---------------------------------------------------------------------------

@app.route("/api/categories", methods=["GET"])
def categories():
    db = get_db()
    rows = db.execute(
        "SELECT category, COUNT(*) as count FROM pages GROUP BY category ORDER BY category COLLATE NOCASE"
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/search", methods=["GET"])
def search():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify([])
    db = get_db()
    like = f"%{q}%"
    rows = db.execute(
        """SELECT * FROM pages
           WHERE title LIKE ? OR content LIKE ? OR tags LIKE ? OR category LIKE ?
           ORDER BY updated_at DESC""",
        (like, like, like, like),
    ).fetchall()
    return jsonify([page_to_dict(r, include_content=False) for r in rows])


# ---------------------------------------------------------------------------
# API: upload & files
# ---------------------------------------------------------------------------

@app.route("/api/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files and "image" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files.get("file") or request.files.get("image")
    if not file or not file.filename:
        return jsonify({"error": "No selected file"}), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"Invalid file type. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"}), 400

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = UPLOAD_DIR / filename
    file.save(filepath)

    return jsonify({
        "url": f"/uploads/{filename}",
        "filename": filename,
        "original_name": file.filename
    }), 201


# ---------------------------------------------------------------------------
# API: backup
# ---------------------------------------------------------------------------

@app.route("/api/backup")
def backup_download():
    """Download a zip containing the database and all uploads."""
    import io
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if DB_PATH.exists():
            # copy while connection may be open: use SQLite's backup via a temp file
            import sqlite3 as _sq
            tmp = DB_PATH.with_suffix(".backup-tmp")
            src = _sq.connect(DB_PATH)
            dst = _sq.connect(tmp)
            with dst:
                src.backup(dst)
            src.close()
            dst.close()
            zf.write(tmp, "wiki.db")
            tmp.unlink()
        if UPLOAD_DIR.exists():
            for f in UPLOAD_DIR.iterdir():
                if f.is_file():
                    zf.write(f, f"uploads/{f.name}")
    buf.seek(0)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return send_file(
        buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"family-wiki-backup-{stamp}.zip",
    )


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(UPLOAD_DIR, filename)


DB_PATH.parent.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, port=port, host="0.0.0.0")

# -------------------------------------------------------------
# API: backup / restore (snapshot management)
# -------------------------------------------------------------
def _snapshots_dir() -> Path:
    return Path(os.environ.get("BACKUP_HOST_DIR", "backups"))

def _snapshot_meta():
    d = _snapshots_dir()
    snaps = []
    if d.is_dir():
        for entry in sorted(d.glob("snapshot_*"), reverse=True):
            if entry.is_dir():
                db_f = entry / "wiki.db"
                snaps.append({
                    "name": entry.name,
                    "created_at": datetime.fromtimestamp(entry.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
                    "has_db": db_f.exists(),
                    "size": sum(f.stat().st_size for f in entry.rglob("*") if f.is_file()),
                })
    return snaps

def _create_snapshot():
    d = _snapshots_dir()
    d.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    snap = d / f"snapshot_{stamp}"
    snap.mkdir(exist_ok=True)

    # 1. SQLite online backup
    src = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    dst = sqlite3.connect(snap / "wiki.db")
    with dst:
        src.backup(dst)
    dst.close(); src.close()

    # 2. JSON export from the snapshot
    conn = sqlite3.connect(snap / "wiki.db"); conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    pages = [dict(r) for r in cur.execute("SELECT * FROM pages ORDER BY id ASC").fetchall()]
    revisions = [dict(r) for r in cur.execute("SELECT * FROM revisions ORDER BY id ASC").fetchall()]
    conn.close()
    json_data = {"metadata": {"version": "1.0", "exported_at": datetime.now().isoformat(),
                              "generator": "Family Wiki", "total_pages": len(pages),
                              "total_revisions": len(revisions)},
                 "pages": pages, "revisions": revisions}
    with open(snap / "data_export.json", "w", encoding="utf-8") as f:
        json.dump(json_data, f, indent=2)
    with open(d / "latest.json", "w", encoding="utf-8") as f:
        json.dump(json_data, f, indent=2)

    # 3. uploads
    up = DB_PATH.parent / "uploads"
    if up.is_dir() and any(up.iterdir()):
        shutil.copytree(up, snap / "uploads")

    # 4. checksums
    with open(snap / "checksum.sha256", "w", encoding="utf-8") as cf:
        for fname in ["wiki.db", "data_export.json"]:
            fp = snap / fname
            if fp.exists():
                h = hashlib.sha256()
                with open(fp, "rb") as fh:
                    while chunk := fh.read(8192):
                        h.update(chunk)
                cf.write(f"{h.hexdigest()}  {fname}\n")

    return snap.name

def _restore_from(source_path: Path):
    """Replace current DB with the given .db or .json file; safety-snapshot first."""
    if not source_path.exists():
        return False, "Source not found"

    # safety snapshot first
    try:
        _create_snapshot()
    except Exception as e:
        return False, f"Failed to take safety snapshot: {e}"

    if source_path.suffix == ".json":
        with open(source_path, encoding="utf-8") as f:
            data = json.load(f)
        pages = data.get("pages", [])
        revisions = data.get("revisions", [])
        conn = get_db()
        conn.execute("DELETE FROM revisions"); conn.execute("DELETE FROM pages")
        for p in pages:
            conn.execute("INSERT INTO pages (title, slug, category, tags, content, author, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (p.get("title"), p.get("slug") or slugify(p.get("title") or "page"), p.get("category") or "Uncategorized",
                 p.get("tags") or "", p.get("content") or "", p.get("author") or "",
                 p.get("created_at"), p.get("updated_at")))
        for r in revisions:
            conn.execute("INSERT INTO revisions (title, content, author, saved_at) VALUES (?,?,?,?)",
                (r.get("title"), r.get("content") or "", r.get("author") or "", r.get("saved_at")))
        conn.commit()
    elif source_path.suffix in (".db", ".sqlite", ".sqlite3"):
        shutil.copy2(source_path, DB_PATH)
    else:
        return False, "Unsupported file type"

    return True, "Restore completed successfully."


@app.route("/api/backup/status")
def backup_status():
    snaps = _snapshot_meta()
    latest = snaps[0] if snaps else None
    return jsonify({
        "snapshots": snaps,
        "latest_snapshot": latest,
        "total_snapshots": len(snaps),
        "retention_days": int(os.environ.get("RETENTION_DAYS", 30)),
    })

@app.route("/api/backup/snapshot", methods=["POST"])
def backup_snapshot():
    try:
        name = _create_snapshot()
        return jsonify({"success": True, "name": name})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/backup/export")
def backup_export():
    fmt = request.args.get("format", "db")
    if fmt == "json":
        d = _snapshots_dir()
        latest = d / "latest.json"
        if not latest.exists():
            _create_snapshot()
        return send_file(d / "latest.json", as_attachment=True, download_name="family-wiki-export.json")
    # db format
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    tmp = Path(tempfile.gettempdir()) / f"wiki-{stamp}.db"
    src = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    dst = sqlite3.connect(tmp)
    with dst:
        src.backup(dst)
    dst.close(); src.close()
    resp = send_file(tmp, as_attachment=True, download_name=f"family-wiki-{stamp}.db")
    @resp.call_on_close
    def _cleanup():
        try: tmp.unlink()
        except Exception: pass
    return resp

@app.route("/api/backup/restore", methods=["POST"])
def backup_restore():
    file = request.files.get("file")
    if file and file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext not in (".json", ".db", ".sqlite", ".sqlite3"):
            return jsonify({"success": False, "error": "Unsupported file type"}), 400
        tmp = Path(tempfile.gettempdir()) / f"restore-{uuid.uuid4().hex}{ext}"
        file.save(tmp)
        ok, msg = _restore_from(tmp)
        try: tmp.unlink()
        except Exception: pass
        return jsonify({"success": ok, "message" if ok else "error": msg}), (200 if ok else 500)
    name = request.form.get("snapshot")
    if not name or "/" in name or ".." in name:
        return jsonify({"success": False, "error": "Invalid snapshot"}), 400
    src = _snapshots_dir() / name
    candidate = src / "wiki.db" if (src / "wiki.db").exists() else src
    ok, msg = _restore_from(candidate)
    return jsonify({"success": ok, "message" if ok else "error": msg}), (200 if ok else 500)
