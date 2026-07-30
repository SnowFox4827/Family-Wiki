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

By default Flask only listens on your own machine. To let other people
on your home network reach it, run:

```bash
python app.py
```

and edit the last line of `app.py` to:

```python
app.run(debug=True, port=5000, host="0.0.0.0")
```

Then family members on the same WiFi network can visit
`http://<your-computer's-local-IP>:5000`. There's no login system —
anyone who can reach the page can edit it, which is fine for a private
home network but not for the open internet. If you want to put it
online permanently, you'd want to add authentication and deploy it
behind a proper web server (e.g. with `gunicorn` + a reverse proxy) —
happy to help with that if you get there.

## Project structure

```
family_wiki/
├── app.py                 Flask app + REST API + SQLite setup
├── requirements.txt
├── Dockerfile             Docker configuration
├── docker-compose.yml     Docker Compose setup (port 5005)
├── data/
│   ├── wiki.db            SQLite database (created on first run)
│   └── uploads/           Uploaded photos and images
├── templates/
│   └── index.html         Single-page app template
└── static/
    ├── css/style.css       Theme styles (Light & Dark modes)
    └── js/app.js           Frontend app logic & image upload handlers
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
