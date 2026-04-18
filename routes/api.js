// JSON API: auth + comments. Mounted at /api.

var express = require('express');
var bcrypt = require('bcryptjs');
var rateLimit = require('express-rate-limit');
var db = require('../lib/db');
var auth = require('../lib/auth');

var router = express.Router();

var loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Příliš mnoho pokusů o přihlášení, zkus to za minutu' },
    standardHeaders: true,
    legacyHeaders: false
});

router.post('/login', loginLimiter, function (req, res) {
    var user = db.prepare('SELECT * FROM users WHERE username = ?').get((req.body.username || '').trim());
    if (!user || !bcrypt.compareSync(req.body.password || '', user.password_hash))
        return res.status(401).json({ error: 'Špatné jméno nebo heslo' });
    req.session.userId = user.id;
    req.session.displayName = user.display_name;
    req.session.isAdmin = user.is_admin === 1;
    res.json({ user: { id: user.id, display_name: user.display_name, is_admin: user.is_admin } });
});

router.post('/logout', function (req, res) {
    req.session.destroy();
    res.json({ ok: true });
});

router.get('/me', function (req, res) {
    if (!req.session.userId) return res.json({ user: null });
    res.json({ user: { id: req.session.userId, display_name: req.session.displayName, is_admin: req.session.isAdmin } });
});

router.get('/comments/:pageId', function (req, res) {
    if (!req.session.userId) return res.json({ comments: [] });
    res.json({
        comments: db.prepare(
            'SELECT c.id, c.content, c.created_at, c.user_id, u.display_name ' +
            'FROM comments c JOIN users u ON c.user_id = u.id ' +
            'WHERE c.page_id = ? ORDER BY c.created_at ASC'
        ).all(req.params.pageId)
    });
});

router.post('/comments/:pageId', auth.requireAuth, function (req, res) {
    var content = (req.body.content || '').trim();
    if (!content || content.length > 2000) return res.status(400).json({ error: 'Neplatný komentář' });
    var r = db.prepare('INSERT INTO comments (page_id, user_id, content) VALUES (?, ?, ?)')
        .run(req.params.pageId, req.session.userId, content);
    res.json({
        comment: db.prepare(
            'SELECT c.id, c.content, c.created_at, c.user_id, u.display_name ' +
            'FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?'
        ).get(r.lastInsertRowid)
    });
});

router.delete('/comments/:id', auth.requireAuth, function (req, res) {
    var c = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Nenalezeno' });
    if (c.user_id !== req.session.userId && !req.session.isAdmin) return res.status(403).json({ error: 'Nepovolen' });
    db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

module.exports = router;
