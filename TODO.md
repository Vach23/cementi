# Cementi — TODO

Practical maintenance only. Keep this list short.

## Worth Doing

- [ ] **Nightly SQLite backup**
  `data/cementi.db` is the only persistent application state: users, comments, articles, and album metadata. Add a simple server-side cron backup with weekly rotation.

- [ ] **Disable `X-Powered-By`**
  Add `app.disable('x-powered-by')` in `server.js`. Small cleanup, no behavior change.

## Done / Removed

- Admin sessions now expire after 12 hours instead of 30 days.
- User/admin status is reloaded from SQLite on each request, so deleted or demoted users lose access.
- Photo upload JavaScript was fixed, the upload form has a non-JS fallback, and updated photo assets get cache-busting URLs.
- The old hardening backlog was trimmed. Persistent session storage, constant-time login, CSP work, comment rate limiting, audit logs, and similar items are unnecessary for this small private site right now.
