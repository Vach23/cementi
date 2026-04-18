// Session-backed auth helpers. Middleware for API (returns JSON errors); page-rendering variant
// lives in layout.js because it has to call the HTML layout.

function getUser(req) {
    if (!req.session.userId) return null;
    return {
        id: req.session.userId,
        display_name: req.session.displayName,
        is_admin: req.session.isAdmin
    };
}

function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Nepřihlášen' });
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.userId || !req.session.isAdmin) return res.status(403).json({ error: 'Nepovolen' });
    next();
}

module.exports = {
    getUser: getUser,
    requireAuth: requireAuth,
    requireAdmin: requireAdmin
};
