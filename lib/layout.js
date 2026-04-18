// Page-level HTML rendering: the outer <html>/<head>/<body> shell, small form helpers,
// and the HTML-rendering variant of the admin guard.

var fs = require('fs');
var path = require('path');
var helpers = require('./helpers');
var auth = require('./auth');

var esc = helpers.esc;

// Inline fonts.css at boot — eliminates a render-blocking request (the file is ~1 KB gzipped).
var inlineFontsCSS = '';
try {
    inlineFontsCSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'fonts.css'), 'utf-8');
} catch (e) {
    console.error('Could not read fonts.css for inlining:', e.message);
}

function layout(title, body, req, opts) {
    opts = opts || {};
    var user = auth.getUser(req);

    return `<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} · Cementi</title>
    <meta name="description" content="Cementi – party spolužáků z VUT Brno, fakulta strojního inženýrství, ročník 1988" />
    <link rel="icon" type="image/jpeg" href="/obrazky/cement.jpg" />
    <link rel="apple-touch-icon" href="/obrazky/cement.jpg" />
    <link rel="preload" href="/fonts/nwpStKy2OAdR1K-IwhWudF-R3wEaZfrc.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/nwpStKy2OAdR1K-IwhWudF-R3w8aZQ.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/nuFiD-vYSZviVYUb_rj3ij__anPXDTzYgA.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/nuFiD-vYSZviVYUb_rj3ij__anPXDTLYgFE_.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/css/style.css" as="style" />
    <style>${inlineFontsCSS}</style>
    <link rel="stylesheet" href="/css/style.css" />
    ${opts.extraHead || ''}
</head>
<body${opts.bodyClass ? ' class="' + opts.bodyClass + '"' : ''}>

    <nav class="main-nav" id="main-nav">
        <div class="nav-inner">
            <a href="/" class="nav-logo">
                <img src="/obrazky/cement.jpg" alt="" />
                <span>Cementi</span>
            </a>
            <div class="nav-links">
                <a href="/">Domů</a>
                <a href="/cas">Galerie</a>
                <a href="/clanky">Články</a>
                ${user && user.is_admin ? '<a href="/admin">Admin</a>' : ''}
            </div>
            <div class="nav-auth" id="nav-auth">
                ${user
                    ? '<span class="nav-user">' + esc(user.display_name) + '</span><a href="#" onclick="fetch(\'/api/logout\',{method:\'POST\'}).then(function(){location.reload()});return false" class="nav-link-btn">Odhlásit</a>'
                    : '<a href="#" onclick="document.getElementById(\'login-modal\').classList.add(\'active\');return false" class="nav-link-btn">Přihlásit se</a>'
                }
            </div>
            <button class="nav-hamburger" onclick="document.querySelector('.nav-links').classList.toggle('open');document.querySelector('.nav-auth').classList.toggle('open')">
                <span></span><span></span><span></span>
            </button>
        </div>
    </nav>

    ${!user ? `
    <div class="modal" id="login-modal">
        <div class="modal-backdrop" onclick="this.parentElement.classList.remove('active')"></div>
        <div class="modal-content">
            <button class="modal-close" onclick="this.closest('.modal').classList.remove('active')">&times;</button>
            <h2>Přihlášení</h2>
            <p class="modal-subtitle">Pouze pro členy party Cementi</p>
            <form id="login-form" onsubmit="return handleLogin(event)">
                <input type="text" name="username" placeholder="Přihlašovací jméno" required autofocus />
                <input type="password" name="password" placeholder="Heslo" required />
                <button type="submit" class="btn btn-primary">Přihlásit se</button>
                <p class="login-error" id="login-error"></p>
            </form>
        </div>
    </div>` : ''}

    ${body}

    <footer>
        <div class="footer-inner">
            <div class="footer-brand">
                <img src="/obrazky/cement.jpg" alt="" width="40" height="40" />
                <div>
                    <strong>Cementi</strong>
                    <small>VUT Brno · Fakulta strojního inženýrství · 1988</small>
                </div>
            </div>
            <p class="footer-copy">Party spolužáků, kteří se scházejí od počátku 90. let. © 1993–${new Date().getFullYear()}</p>
        </div>
    </footer>

    <script src="/js/app.js"></script>
</body>
</html>`;
}

// Renders an inline <form> with a JS confirm() dialog. Used for every destructive action.
function confirmDeleteForm(action, promptLabel, buttonHtml, hidden) {
    var escLabel = esc(promptLabel).replace(/'/g, "\\'");
    var hiddenHtml = '';
    if (hidden) {
        Object.keys(hidden).forEach(function (k) {
            hiddenHtml += '<input type="hidden" name="' + esc(k) + '" value="' + esc(hidden[k]) + '" />';
        });
    }
    return '<form method="POST" action="' + action + '" class="inline-form" onsubmit="return confirm(\'Opravdu smazat ' + escLabel + '?\')">'
        + hiddenHtml + buttonHtml + '</form>';
}

function requireAdminPage(req, res, next) {
    if (!req.session.userId || !req.session.isAdmin) {
        return res.status(403).send(layout('Admin',
            '<section class="page-header"><div class="container"><h1>Přístup odepřen</h1></div></section>' +
            '<section class="section"><div class="container"><p>Tato stránka je jen pro administrátory. <a href="/">Zpět na úvod</a></p></div></section>',
            req));
    }
    next();
}

module.exports = {
    layout: layout,
    confirmDeleteForm: confirmDeleteForm,
    requireAdminPage: requireAdminPage
};
