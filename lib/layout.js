// Page-level HTML rendering: the outer <html>/<head>/<body> shell, small form helpers,
// and the HTML-rendering variant of the admin guard.

var fs = require('fs');
var path = require('path');
var helpers = require('./helpers');
var auth = require('./auth');

var esc = helpers.esc;

function assetVersion(publicPath) {
    try {
        return '?v=' + Math.floor(fs.statSync(path.join(__dirname, '..', 'public', publicPath)).mtimeMs);
    } catch (e) {
        return '';
    }
}

function stylesheetTag(publicPath) {
    return '<link rel="stylesheet" href="' + publicPath + assetVersion(publicPath) + '" />';
}

function scriptTag(publicPath) {
    return '<script src="' + publicPath + assetVersion(publicPath) + '"></script>';
}

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
    var extraStyles = (opts.stylesheets || []).map(stylesheetTag).join('\n    ');
    var extraLocalScripts = (opts.scripts || []).map(scriptTag).join('\n    ');

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
    <link rel="preload" href="/css/style.css${assetVersion('/css/style.css')}" as="style" />
    <style>${inlineFontsCSS}</style>
    ${stylesheetTag('/css/style.css')}
    ${extraStyles}
    ${opts.extraHead || ''}
</head>
<body${opts.bodyClass ? ' class="' + opts.bodyClass + '"' : ''}>

    <nav class="main-nav" id="main-nav">
        <div class="nav-inner">
            <div class="nav-bar">
                <a href="/" class="nav-logo">
                    <img src="/obrazky/cement.jpg" alt="" />
                    <span>Cementi</span>
                </a>
                <button type="button" class="nav-hamburger" data-nav-toggle aria-label="Otevřít menu" aria-controls="nav-menu" aria-expanded="false">
                    <span></span><span></span><span></span>
                </button>
            </div>
            <div class="nav-menu" id="nav-menu">
                <a href="/" class="nav-item">Domů</a>
                <a href="/cas" class="nav-item">Galerie</a>
                <a href="/clanky" class="nav-item">Články</a>
                ${user && user.is_admin ? '<a href="/admin" class="nav-item">Admin</a>' : ''}
                ${user
                    ? '<span class="nav-item nav-user">' + esc(user.display_name) + '</span><button type="button" class="nav-item nav-link-btn" data-logout>Odhlásit</button>'
                    : '<button type="button" class="nav-item nav-link-btn" data-open-modal="login-modal">Přihlásit se</button>'
                }
            </div>
        </div>
    </nav>

    ${!user ? `
    <div class="modal" id="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-modal-title" hidden>
        <div class="modal-backdrop" data-close-modal></div>
        <div class="modal-content">
            <button type="button" class="modal-close" data-close-modal aria-label="Zavřít přihlášení">&times;</button>
            <h2 id="login-modal-title">Přihlášení</h2>
            <p class="modal-subtitle">Pouze pro členy party Cementi</p>
            <form id="login-form">
                <label class="sr-only" for="login-username">Přihlašovací jméno</label>
                <input id="login-username" type="text" name="username" placeholder="Přihlašovací jméno" autocomplete="username" required />
                <label class="sr-only" for="login-password">Heslo</label>
                <input id="login-password" type="password" name="password" placeholder="Heslo" autocomplete="current-password" required />
                <button type="submit" class="btn btn-primary">Přihlásit se</button>
                <p class="login-error" id="login-error"></p>
            </form>
        </div>
    </div>` : ''}

    ${body}

    <footer>
        <div class="footer-inner container">
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

    ${scriptTag('/js/app.js')}
    ${opts.extraScripts || ''}
    ${extraLocalScripts}
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
    return '<form method="POST" action="' + action + '" class="inline-form" data-confirm="Opravdu smazat ' + escLabel + '?">'
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
