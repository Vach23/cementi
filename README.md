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

## Development notes

- Keep the app boring: no build step, framework, or TypeScript unless there is a concrete need.
- Routes should depend on `lib/`, not on each other. `lib/db.js` owns the shared SQLite handle; `lib/helpers.js` should stay dependency-free.
- CSS lives in `public/css/`, not inline in server templates.
- Keep Czech text as UTF-8 with diacritics.
- Never commit photo originals or generated image assets.
- Article seed files in `data/articles/` are read only when the `articles` table is empty. After that, SQLite/admin UI is the source of truth.
- `titulni_strana` is a system album used by the homepage slideshow/story photos.
- Production runs behind nginx/HTTPS on port 3000. Nginx needs `client_max_body_size 100M` or large photo uploads will fail before reaching Node.

## TODO

Practical maintenance only. Keep this list short.

- [ ] **Nightly SQLite backup**
  `data/cementi.db` is the only persistent application state: users, comments, articles, and album metadata. Add a simple server-side cron backup with weekly rotation.

- [ ] **Disable `X-Powered-By`**
  Add `app.disable('x-powered-by')` in `server.js`. Small cleanup, no behavior change.

- [ ] **Album folder metadata import**
  Support optional `metadata.json` files inside `public/foto/<album>/` for initial album title, subtitle, sort order, description, and cover photo. Import them into SQLite during album sync; keep the database as the runtime source of truth and do not overwrite admin-edited fields.

### Done / Removed

- Admin sessions now expire after 12 hours instead of 30 days.
- User/admin status is reloaded from SQLite on each request, so deleted or demoted users lose access.
- Photo upload JavaScript was fixed, the upload form has a non-JS fallback, and updated photo assets get cache-busting URLs.
- The old hardening backlog was trimmed. Persistent session storage, constant-time login, CSP work, comment rate limiting, audit logs, and similar items are unnecessary for this small private site right now.
