# Cementi

Website for the "Cementi" reunion group — mechanical engineers who graduated from VUT Brno (Faculty of Mechanical Engineering) in 1988. The group has been holding annual reunions ("Cementárny") every last weekend of May since the early 1990s.

The site hosts photo galleries, archival articles, and a comments system for group members.

## Quick start

```bash
npm install
node server.js
# → http://localhost:3000
```

Default login: `admin` / `admin`

## Photos and data

Photos, thumbnails, and the database are **not in git** (~1 GB total). They're shipped separately in `cementi-server-data.zip`.

To set up, unzip the data archive into the project root:

```bash
unzip cementi-server-data.zip -d .
```

This adds:
- `public/foto/` — original photos
- `public/thumbs/` — WebP thumbnails
- `public/display/` — display-size copies for the lightbox
- `public/obrazky/articles/` — article icons
- `data/cementi.db` — SQLite database (users, comments, albums, articles)

Without the zip, the server still starts — it creates a fresh database with default users and seeds articles from `data/articles/`. Albums appear automatically when you add photo folders to `public/foto/`.

### Regenerating thumbnails

After adding photos manually to `public/foto/YEAR/`:

```bash
node generate-thumbnails.js
```

## Stack

- **Node.js 20** + Express
- **better-sqlite3** (SQLite) for data
- **sharp** for image processing
- Vanilla CSS + JS (no build step, no framework)

## Adding photos

**Admin UI:** Log in at `/admin` and use the upload form on any album page.

**Manual:** Drop files into `public/foto/YEAR/`, run `node generate-thumbnails.js`, deploy.

## Admin panel

At `/admin` (requires admin login):
- **Albums** — create, edit metadata, upload/delete photos, set cover photo
- **Articles** — WYSIWYG editor (Quill), icon upload, intro article for homepage
- **Users** — create, edit display names, change passwords, toggle admin, delete

## Deployment (Linux)

```bash
./deploy_linux.sh user@host          # deploys to the given target
```

The script rsyncs code and photos, installs dependencies, and restarts the PM2 process. The server runs behind nginx on port 3000.

## Deployment (Windows)

See [WINDOWS-MIGRATION.md](WINDOWS-MIGRATION.md) for a full guide on running with IIS + Windows Service.

## Project structure

```
server.js               Express app entry point
lib/                    Application logic (db, auth, layout, helpers, photos, albums, articles)
routes/                 Express routers (pages, admin, api)
data/articles/          Seed content (HTML + manifest.json)
public/css/style.css    Single stylesheet
public/js/app.js        Client JS (lightbox, comments, login)
public/foto/            Photos (gitignored)
public/thumbs/          Thumbnails (gitignored)
```

Full architecture details are in [CLAUDE.md](CLAUDE.md).
