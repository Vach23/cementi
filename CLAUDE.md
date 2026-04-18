# Cementi

Website for a reunion group of mechanical engineers who graduated from VUT Brno (Brno University of Technology, Faculty of Mechanical Engineering) in 1988. The group ("Cementi" — nickname coined around 1985 by Honza Kučera "Šanek") has been holding annual reunions ("Cementárny") every last weekend of May since the early 1990s.

The site hosts photo galleries from every reunion (1996–2015, plus older material from the study years), two archival articles (including a famous-within-the-group parody paper on "pivního pole" / beer field theory), and a comments system for the group members.

## Stack

- **Node.js 20** + Express
- **better-sqlite3** for users, comments, album metadata
- **bcryptjs** for password hashing, **express-session** for auth
- **multer** for photo uploads
- **sharp** for WebP thumbnail generation
- Vanilla CSS + JS on the frontend (no build step)
- **PM2** for process management in production
- **nginx** as reverse proxy

No TypeScript, no bundler, no framework. Template literals inside the server render full HTML pages. Keep it boring and easy to hack on.

## Structure

```
cementi/
├── server.js                   Entry point: middleware + mount routers + listen (~30 lines)
├── generate-thumbnails.js      One-off CLI to regenerate WebP thumbs (admin upload does it inline)
├── package.json
├── deploy_linux.sh                   Reusable deploy script
├── lib/                        Pure building blocks, one concern per file
│   ├── db.js                   better-sqlite3 instance + schema (CREATE TABLE IF NOT EXISTS)
│   ├── helpers.js              Pure: esc, slugify, excerptPlain/Rich, safeFilename/AlbumId, IMAGE_RE, toThumbName
│   ├── auth.js                 getUser + requireAuth + requireAdmin (JSON-errored, for API/POST)
│   ├── layout.js               layout() HTML shell, confirmDeleteForm, requireAdminPage (HTML-errored)
│   ├── photos.js               getPhotos/Videos, generateThumb (sharp), thumbPath + getThumbSet, albumMeta
│   ├── albums.js               Album DAO (+ syncAlbums scan of public/foto/)
│   └── articles.js             Article DAO + seedArticles() — reads data/articles/ on first boot
├── routes/                     Express routers mounted by server.js
│   ├── pages.js                /, /cas, /galerie/:album, /clanky, /clanek/:slug
│   ├── admin.js                /admin/* (overview, album editor, article CRUD, user create/delete); owns its multer configs
│   └── api.js                  /api/login, /api/logout, /api/me, /api/comments/*
├── data/
│   ├── cementi.db              SQLite (users, comments, albums, articles)
│   └── articles/               Seed content — hackable as regular HTML, committed to git
│       ├── manifest.json       [{ slug, title, meta, icon, is_intro, sort_order }, …]
│       ├── pribeh-cementu.html Intro article (is_intro=1, shown on homepage)
│       ├── pivnipole.html
│       └── otrava.html
├── public/
│   ├── css/style.css           Single stylesheet
│   ├── js/app.js               Lightbox + comments + login logic
│   ├── obrazky/                Small static assets (logo, etc.)
│   ├── obrazky/articles/       Uploaded article icons (admin panel)
│   ├── foto/YYYY/*.jpg         Original photos (~400 MB, gitignored)
│   └── thumbs/YYYY/*.webp      Generated thumbnails (~25 MB, gitignored)
└── node_modules/
```

Express serves everything under `public/` as static. The server templates reference `/foto/...` and `/thumbs/...` paths accordingly.

### Module boundaries

- `lib/db.js` is the single shared DB handle — required by `articles.js`, `albums.js`, and every route file.
- `lib/helpers.js` has **zero** runtime dependencies (pure functions + regex constants). Require it freely.
- `lib/layout.js` imports `helpers` + `auth` (for `getUser` inside `layout()` and `requireAdminPage`).
- `lib/articles.js` reads `data/articles/manifest.json` + `<slug>.html` lazily in `seedArticles()`, only if the `articles` table is empty. To re-seed, `DELETE FROM articles` and restart.
- `routes/admin.js` owns its multer configs (`photoUpload`, `iconUpload`) because those know about route-level concerns (expected field names, file types). Pure helpers stay in `lib/`.
- Routes only depend on `lib/` — they never import each other.
- **Editing article content**: change the HTML files in `data/articles/`, then *either* `DELETE FROM articles` and restart (re-seed) *or* edit via the admin UI at `/admin/clanek/:slug/edit`. The two paths diverge — disk files are only read on first seed.

### Photo albums

Album IDs are directory names under `public/foto/`. Year albums are `YYYY` (e.g. `2005`). Special albums: `puleni`, `carodky1988`, `ostatni`, `titulni_strana` (the last is used for homepage slideshow photos; it's hidden from the gallery list).

The server scans the filesystem on each page load to determine what albums and photos exist. Uploading new files or dropping them into a folder makes them appear automatically. Album metadata (title, subtitle, sort order) lives in the `albums` table and is populated lazily by `syncAlbums()`.

## Running locally

```bash
npm install           # first time only
node server.js        # → http://localhost:3000

# After adding new photos to public/foto/YEAR/:
node generate-thumbnails.js
```

Default port is 3000, override with `PORT` env var.

## Database

Four tables:

| Table | Purpose |
|---|---|
| `users` | `username`, `display_name`, `password_hash` (bcrypt), `is_admin` |
| `comments` | `page_id` (string), `user_id`, `content`, `created_at` |
| `albums` | `id` (matches directory name), `title`, `subtitle`, `sort_order` |
| `articles` | `slug` (URL-safe id), `title`, `meta`, `icon`, `excerpt`, `content` (HTML), `is_intro` (0/1 – only one is_intro=1 at a time; drives homepage story section), `sort_order` |

Comments are attached to a `page_id` — a string the page provides via `<div class="comments-section" data-page="...">`. Examples: `index`, `galerie/2005`, `clanek/pivnipole`.

The schema is created by `deploy_linux.sh` and by `server.js` on boot (`CREATE TABLE IF NOT EXISTS`).

Seeded users (only on a fresh DB):
- `admin` / `admin` — full admin
- `test` / `test123` — comments only

Passwords can be changed via the admin panel (`/admin`) — each user row has an inline "Nové heslo" field.

## Key routes

| Route | What it does |
|---|---|
| `/` | Homepage: hero slideshow, story, bulletin-board album grid, articles, comments |
| `/cas` | Timeline: special albums interleaved chronologically (Půlení 1986, Čarodky 1988, year reunions 1996–2015, Ostatní at end) |
| `/galerie/:album` | Paginated masonry gallery (36 per page), lightbox, prev/next album nav, comments |
| `/clanky` | Article list |
| `/clanek/:slug` | Renders an article from the `articles` DB table (e.g. `pribeh-cementu`, `pivnipole`, `otrava`). 404 if slug not found. |
| `/admin` | Overview page: Alba / Články / Uživatelé sections, each with its own create form + list (admin only) |
| `/admin/album/:id` | Per-album editor: basic fields, drag-in photo upload (thumbs auto-generated via `sharp`), photo grid with cover+delete per photo, danger zone with type-the-ID confirm to delete the whole album |
| `/admin/clanek/new`, `/admin/clanek/:slug/edit`, `/admin/clanek/save` (POST), `/admin/clanek/:id/delete` (POST) | Article CRUD (admin only) |
| `/admin/album/:id/upload` (POST), `/admin/album/:id/photo/delete` (POST), `/admin/album/:id/cover` (POST), `/admin/album/:id/delete` (POST), `/admin/user/:id/delete` (POST) | Admin mutations — every destructive action has a JS `confirm()` (or prompt for album) |
| `/api/*` | Auth (`login`, `logout`, `me`), comments CRUD, admin upload |

## Frontend behaviour

`public/js/app.js` is the only client-side script. It handles:

- **Lightbox** — any `<img data-full="...">` becomes clickable; keyboard arrows + escape work.
- **Comments** — `<div class="comments-section" data-page="ID">` auto-initializes. Comments are only visible to logged-in users (the API returns an empty array when not authenticated).
- **Login modal** — the navbar login link opens a modal; submission hits `/api/login`.
- **Hero slideshow** — the home page has an inline `<script>` that cycles `#hero-slideshow .hero-slide` images every 4s with fade.

## Design

- Colors: deep navy (`#1a2744`), warm amber (`#c9913d`), warm paper (`#f8f5ee`), dark text (`#2d2a24`)
- Typography: Playfair Display (headings), Source Sans 3 (body)
- Logo is round (`border-radius: 50%`)
- Timeline = vertical alternating cards with year markers (includes study-era albums interleaved by their sort year)
- Home album grid = bulletin-board-style card grid
- Navigation is three simple links: Domů, Galerie, Články (no dropdowns)

## Deployment

```bash
./deploy_linux.sh user@host                 # deploys to the given target
```

The script does:
1. rsync code (no `node_modules`, `data/*.db`, `.git`, photos, thumbs)
2. rsync `public/foto/` with `--size-only` (skips unchanged photos on re-deploys)
3. rsync `public/thumbs/`
4. Install Node 20 + PM2 on the server if missing
5. `npm install --production`
6. Initialize DB if missing (seeds `admin` and `test` users)
7. Restart the `cementi` PM2 process

The target server is expected to be Ubuntu with Node 20, PM2, and a reverse proxy (e.g. nginx) in front of port 3000. The app lives at `/opt/cementi/` and runs on port 3000 bound to localhost only.

## Adding photos

Two ways:

**1. Admin UI** (easiest):
- Log in as admin at `/admin`
- Use the upload form — select album, pick files, submit

**2. Manual** (bulk):
- Drop files into `public/foto/YEAR/` locally
- Run `node generate-thumbnails.js` to produce WebP thumbs
- `./deploy_linux.sh` syncs only the new files (rsync `--size-only`)
- On server, thumbnails will be generated if you re-run `generate-thumbnails.js` there too, but since the deploy also uploads local thumbs, it's usually not needed

## Known issues / TODOs

- **No password reset flow** — passwords can be changed via the admin panel (inline in the Uživatelé table), but there's no self-service reset. Not a real problem for a group of ~25 people.
- **Comment deletion UX** — only the author or an admin can delete, no confirmation dialog for admins. Fine as-is.

## Architecture decisions

- **Do not introduce a build step** unless there's a concrete reason. The "no npm run build" simplicity is a feature — a non-dev family member may eventually want to modify text or colors.
- **Keep CSS in `public/css/style.css`**, not inlined in `server.js`. Earlier versions inlined CSS; v3 extracted it so the stylesheet can be cached and edited independently.
- All Czech text uses proper diacritics (č, š, ž, ř, ů, etc.) in UTF-8. Do not regress to ASCII approximations.
- The photo set is ~1,350 photos totalling ~400 MB. Never commit them to git.
- The article editor uses **Quill** WYSIWYG with a hidden `<textarea>` fallback for noscript. Article HTML is sanitized server-side via `sanitize-html`.
