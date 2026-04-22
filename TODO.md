# Cementi — TODO

## Hardening (from security review, 2026-04-22)

Non-critical — all admin perimeter holds, no external exploits found. Production-hygiene items to work through as time allows.

### High

- [ ] **Persistent session store + SESSION_SECRET**
  Currently `express-session` uses the default in-process MemoryStore and a per-boot random secret, so every `pm2 restart` logs everyone out and memory leaks under load. Install `better-sqlite3-session-store`, wire it into the existing `db` handle, and set `SESSION_SECRET` via PM2 ecosystem config (generated once with `openssl rand -hex 32`). Remove the `crypto.randomBytes` fallback.

### Medium

- [ ] **Re-hydrate `isAdmin` from DB per request**
  Session caches `isAdmin` at login time, so demoting or deleting a user leaves their existing session admin-valid for up to 30 days. Add a middleware that re-reads `is_admin` from the `users` table on every request with a session; destroy the session if the user row is gone.

- [ ] **Security headers in nginx**
  Add to the nginx server block:
  ```
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Frame-Options "DENY" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  ```
  Skip CSP for now — inline scripts on homepage/admin pages make it low ROI.

- [ ] **Nightly SQLite backup**
  `data/cementi.db` is the only persistent state (users, comments, articles, album metadata) and is excluded from the deploy rsync. Add a server-side cron: `sqlite3 data/cementi.db ".backup ..."` with weekly rotation, ideally pushed off-box (B2/S3 via rclone).

### Low

- [ ] **Disable `X-Powered-By`**
  One line: `app.disable('x-powered-by')` in `server.js`.

- [ ] **Shrink JSON body limit**
  `app.use(express.json({ limit: '10kb' }))` — prevents oversized login bodies triggering expensive bcrypt work.

- [ ] **Constant-time login**
  `routes/api.js` short-circuits bcrypt when the username doesn't exist, leaking username existence via response timing. Run bcrypt against a dummy hash when user is null. Marginal for a 25-person site.

- [ ] **Apply `sanitizeArticleHtml` in `seedArticles()` too**
  Seed path reads `data/articles/*.html` verbatim into DB; admin save path sanitizes. Asymmetry is a footgun if the seed flow is ever extended.

- [ ] **Conditional `cookie.secure`**
  `secure: true` breaks local dev over HTTP. Switch to `secure: process.env.NODE_ENV === 'production'` and set `NODE_ENV=production` in PM2 ecosystem config.

- [ ] **Run `generate-thumbnails.js` in deploy script**
  Manual photo drops into `public/foto/YEAR/` currently need a separate thumb-gen step; otherwise lightbox falls back to serving 5 MB originals.

### Not fixing (documented here so we don't reopen it)

- **No CSRF tokens** — currently protected by `sameSite: 'lax'` on the session cookie. Sufficient as long as all mutations stay POST-only and the cookie setting isn't weakened.
- **No rate limit on comments** — trust model is 25 known people. Login rate limit (10/min) is sufficient.
- **No audit log for admin actions** — single-admin site, low value.
