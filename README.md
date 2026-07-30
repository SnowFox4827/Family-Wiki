# The Family Wiki

A small self-hosted wiki for organizing family pages: recipes, stories,
relatives, houses you lived in — anything worth keeping. Built with
Flask + SQLite on the backend and plain HTML/CSS/JS on the frontend
(no build step required).

## Features

- Light and Dark mode toggle (persists across sessions)
- Photo and image uploads (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`) with drag-and-drop & paste support in the editor
- Create, edit, and delete pages
- Organize pages into categories (shown as "shelves" in the sidebar)
- Tag pages and search across titles, content, tags, and categories
- Link one page to another with `[[Page Title]]` syntax — it becomes a
  clickable link automatically (and shows as a soft dashed link if the
  target page doesn't exist yet, so you can click it to create it)
- Lightweight formatting in content: `# Heading`, `## Subheading`,
  `**bold**`, `*italic*`, `- list items`
- Every save keeps a revision in the database (visible via the
  `/api/pages/<id>/history` endpoint, for future use)
- Recently updated pages shown in the sidebar

## Setup

1. **Install dependencies** (Python 3.9+ recommended):

   ```bash
   cd family_wiki
   python3 -m venv venv
   source venv/bin/activate   # on Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Run it:**

   ```bash
   python app.py
   ```

   This creates `data/wiki.db` (a SQLite file inside `data/`) the first
   time you run it, seeded with a "Welcome" page.

3. Open **http://127.0.0.1:5000** or **http://<your-local-ip>:5000** in your browser.

## Docker Setup

To run the application with Docker Compose:

```bash
# Build and start in detached (background) mode
docker compose up -d --build
```

To stop the running container:

```bash
docker compose down
```

To view logs while running in background mode:

```bash
docker compose logs -f
```

Once started, access the app in your browser at **http://127.0.0.1:5005** (on your local machine) or **http://<your-local-ip>:5005** (from other devices on your network).

## Sharing it with your family

### Option A: Using Docker Compose (Recommended)
When running with Docker Compose (`docker compose up -d`), port `5005` is automatically exposed to your network. Family members on the same Wi-Fi network can visit:

```text
http://<your-local-ip>:5005
```

### Option B: Running directly with Python
By default, running `python app.py` listens locally on `http://127.0.0.1:5000`. To allow other devices on your home network to connect, make sure `app.py` binds to `0.0.0.0`:

```python
app.run(debug=True, port=5000, host="0.0.0.0")
```

Then family members can visit:

```text
http://<your-local-ip>:5000
```

> **Note:** There is no authentication system — anyone who can reach the IP on your home Wi-Fi network can view and edit pages.

## Project structure

```
family_wiki/
├── app.py                 Flask app + REST API + SQLite setup
├── requirements.txt
├── Dockerfile             Docker configuration
├── .dockerignore         Docker ignore rules
├── docker-compose.yml     Docker Compose setup (port 5005)
├── data/
│   ├── wiki.db            SQLite database (created on first run)
│   └── uploads/           Uploaded photos and images
├── templates/
│   ├── index.html         Main single-page app layout
│   └── components/        Modular HTML partials
│       ├── topbar.html    Header & search bar
│       ├── sidebar.html   Category shelf & recent pages
│       ├── view_page.html Reading view
│       ├── view_editor.html Editor form & upload bar
│       └── view_empty.html Empty state view
└── static/
    ├── css/style.css       Theme styles (Light & Dark modes)
    └── js/
        ├── app.js         Main entry point & state coordinator
        └── modules/       ES modules by responsibility
            ├── api.js     REST API calls
            ├── theme.js   Light/Dark mode toggle
            ├── markdown.js Markdown & wiki link parser
            └── upload.js  Image upload handlers
```

## API reference

| Method | Path                        | Description                    |
|--------|------------------------------|--------------------------------|
| GET    | `/api/pages`                 | List all pages (no content)    |
| GET    | `/api/pages/<id>`             | Get one page with full content |
| POST   | `/api/pages`                  | Create a page                  |
| PUT    | `/api/pages/<id>`             | Update a page                  |
| DELETE | `/api/pages/<id>`             | Delete a page                  |
| GET    | `/api/pages/<id>/history`     | List revisions for a page      |
| GET    | `/api/categories`             | List categories with counts    |
| GET    | `/api/search?q=...`           | Search pages                   |
| POST   | `/api/upload`                | Upload an image file           |
| GET    | `/uploads/<filename>`        | Serve an uploaded image file   |

## Ideas for extending it

- Add a simple shared password gate before editing
- Show a diff view using the `revisions` table that's already there
- Add a "family tree" page type with a visual chart
