// Admin panel + all destructive mutations. Mounted at /admin.
// Multer upload configs live here because they know about route-level concerns
// (expected field names, file types, destination layout).

var express = require('express');
var multer = require('multer');
var path = require('path');
var fs = require('fs');
var bcrypt = require('bcryptjs');
var sanitizeHtml = require('sanitize-html');

var db = require('../lib/db');
var helpers = require('../lib/helpers');
var auth = require('../lib/auth');
var layoutLib = require('../lib/layout');
var photosLib = require('../lib/photos');
var albumsLib = require('../lib/albums');
var articlesLib = require('../lib/articles');

var esc = helpers.esc;
var slugify = helpers.slugify;
var safeFilename = helpers.safeFilename;
var safeAlbumId = helpers.safeAlbumId;

var layout = layoutLib.layout;
var confirmDeleteForm = layoutLib.confirmDeleteForm;
var requireAdminPage = layoutLib.requireAdminPage;
var requireAdmin = auth.requireAdmin;

function adminLayout(title, body, req, opts) {
    opts = opts || {};
    var merged = {};
    Object.keys(opts).forEach(function (k) { merged[k] = opts[k]; });
    merged.stylesheets = (opts.stylesheets || []).concat('/css/admin.css');
    return layout(title, body, req, merged);
}

var FOTO_DIR = photosLib.FOTO_DIR;
var THUMB_DIR = photosLib.THUMB_DIR;
var DISPLAY_DIR = photosLib.DISPLAY_DIR;
var getPhotos = photosLib.getPhotos;
var getVideos = photosLib.getVideos;
var invalidateCache = photosLib.invalidateCache;
var getThumbSet = photosLib.getThumbSet;
var thumbPath = photosLib.thumbPath;
var generateResized = photosLib.generateResized;
var removeThumb = photosLib.removeThumb;

var getAlbums = albumsLib.getAlbums;
var invalidateSync = albumsLib.invalidateSync;
var isYearAlbum = albumsLib.isYearAlbum;
var albumSubtitle = albumsLib.albumSubtitle;
var getArticle = articlesLib.getArticle;
var getArticles = articlesLib.getArticles;

// Albums whose deletion would break the public site. Photos inside can still be managed normally.
var PROTECTED_ALBUMS = { 'titulni_strana': true };

// Whitelist for article HTML sanitization
var SANITIZE_OPTS = {
    allowedTags: ['p', 'h1', 'h2', 'h3', 'strong', 'em', 's', 'u', 'a', 'blockquote', 'ol', 'ul', 'li', 'img', 'br', 'hr'],
    allowedAttributes: {
        'a': ['href', 'title'],
        'img': ['src', 'alt', 'class', 'loading']
    },
    allowedSchemes: ['http', 'https'],
    disallowedTagsMode: 'discard'
};

function sanitizeArticleHtml(html) {
    return sanitizeHtml(html, SANITIZE_OPTS);
}

var ICON_DIR = path.join(__dirname, '..', 'public', 'obrazky', 'articles');
fs.mkdirSync(ICON_DIR, { recursive: true });

function uniqueUploadName(prefix, originalName, fallbackExt) {
    var ext = path.extname(originalName).toLowerCase() || fallbackExt;
    return prefix + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
}

function makeUpload(opts) {
    return multer({
        storage: multer.diskStorage({
            destination: opts.destination,
            filename: function (req, file, cb) {
                cb(null, uniqueUploadName(opts.prefix || '', file.originalname, opts.fallbackExt));
            }
        }),
        fileFilter: function (req, file, cb) {
            var ok = opts.accept(file.originalname);
            cb(ok ? null : new Error(opts.errorMessage), ok);
        },
        limits: { fileSize: opts.limitMb * 1024 * 1024 }
    });
}

var photoUpload = makeUpload({
    prefix: '',
    fallbackExt: '.jpg',
    limitMb: 50,
    errorMessage: 'Nepovolený typ',
    accept: function (name) { return helpers.IMAGE_RE.test(name) || helpers.VIDEO_RE.test(name); },
    destination: function (req, file, cb) {
        var albumId = req.params.id;
        if (!albumId) return cb(new Error('album id missing'));
        var dir = path.join(FOTO_DIR, albumId);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    }
});

var iconUpload = makeUpload({
    prefix: 'icon-',
    fallbackExt: '.img',
    limitMb: 5,
    errorMessage: 'Neplatný typ obrázku',
    accept: function (name) { return helpers.IMAGE_RE.test(name); },
    destination: function (req, file, cb) { cb(null, ICON_DIR); }
});

var articleImageUpload = makeUpload({
    prefix: 'article-',
    fallbackExt: '.jpg',
    limitMb: 10,
    errorMessage: 'Neplatný typ obrázku',
    accept: function (name) { return helpers.IMAGE_RE.test(name); },
    destination: function (req, file, cb) { cb(null, ICON_DIR); }
});

function removeManagedIcon(iconPath) {
    if (!iconPath || iconPath.indexOf('/obrazky/articles/') !== 0) return;
    try { fs.unlinkSync(path.join(__dirname, '..', 'public', iconPath)); } catch (e) { }
}

var router = express.Router();

// ── Admin overview ─────────────────────────────────────────
router.get('/', requireAdminPage, function (req, res) {
    var user = auth.getUser(req);
    var albums = getAlbums();
    var users = db.prepare('SELECT id, username, display_name, is_admin FROM users ORDER BY id').all();
    var articles = getArticles();

    var photoCounts = {};
    albums.forEach(function (a) { photoCounts[a.id] = getPhotos(a.id).length; });
    var commentCounts = {};
    db.prepare('SELECT user_id, COUNT(*) AS c FROM comments GROUP BY user_id').all()
        .forEach(function (r) { commentCounts[r.user_id] = r.c; });

    // Group albums by where they appear on the public site.
    var yearAlbums = albums.filter(isYearAlbum);
    var specialAlbums = albums.filter(function (a) { return !isYearAlbum(a) && !PROTECTED_ALBUMS[a.id]; });
    var systemAlbums = albums.filter(function (a) { return PROTECTED_ALBUMS[a.id]; });

    function albumRow(a) {
        var subtitle = albumSubtitle(a);
        return '<tr>'
            + '<td data-label="ID"><a href="/galerie/' + esc(a.id) + '">' + esc(a.id) + '</a></td>'
            + '<td data-label="Název">' + esc(a.title) + '</td>'
            + '<td data-label="Místo">' + esc(subtitle) + '</td>'
            + '<td data-label="Fotek">' + photoCounts[a.id] + '</td>'
            + '<td data-label="Akce" class="admin-actions">'
            + '<a href="/admin/album/' + esc(a.id) + '" class="btn-sm">Upravit</a>'
            + '</td></tr>';
    }
    function albumTable(rows) {
        return rows.length === 0
            ? '<p class="form-hint">Žádná alba.</p>'
            : '<table class="admin-table">'
                + '<thead><tr><th>ID</th><th>Název</th><th>Místo</th><th>Fotek</th><th>Akce</th></tr></thead>'
                + '<tbody>' + rows.map(albumRow).join('') + '</tbody></table>';
    }

    var body = `
    <section class="page-header"><div class="container"><h1>Administrace</h1></div></section>
    <section class="section">
        <div class="container">

            <div class="admin-section">
                <div class="admin-section-header">
                    <h2>Cementárny <span class="admin-count">${yearAlbums.length}</span></h2>
                </div>
                <p class="form-hint">Alba se zobrazují na časové ose <a href="/cas">/cas</a>. Pojmenovávají se ID ve formátu roku (např. <code>2024</code>) – ID se použije jako popisek na ose.</p>

                <form method="POST" action="/admin/album/create" class="admin-inline-form">
                    <input name="id" placeholder="ID (např. 2024)" required pattern="[0-9]{4}" title="Čtyřciferný rok" />
                    <input name="title" placeholder="Název" required />
                    <input name="subtitle" placeholder="Místo konání" />
                    <button class="btn btn-primary">+ Nový sraz</button>
                </form>

                ${albumTable(yearAlbums)}
            </div>

            <div class="admin-section">
                <div class="admin-section-header">
                    <h2>Z dob studia <span class="admin-count">${specialAlbums.length}</span></h2>
                </div>
                <p class="form-hint">Speciální alba (např. <code>puleni</code>, <code>carodky1988</code>). Zobrazují se na <a href="/cas">/cas</a> v sekci „Z dob studia". ID je krátký název bez diakritiky a mezer.</p>

                <form method="POST" action="/admin/album/create" class="admin-inline-form">
                    <input name="id" placeholder="ID (např. promoce)" required pattern="[a-z0-9_-]+" title="Malá písmena, číslice, _ nebo -" />
                    <input name="title" placeholder="Název" required />
                    <input name="subtitle" placeholder="Podtitulek" />
                    <button class="btn btn-primary">+ Nové album</button>
                </form>

                ${albumTable(specialAlbums)}
            </div>

            ${systemAlbums.length ? `
            <div class="admin-section">
                <div class="admin-section-header">
                    <h2>Systémová alba <span class="admin-count">${systemAlbums.length}</span></h2>
                </div>
                <p class="form-hint">Speciální alba používaná jinde na webu (např. fotky pro domovskou stránku). Nelze je smazat, ale lze upravovat jejich obsah.</p>
                ${albumTable(systemAlbums)}
            </div>` : ''}

            <div class="admin-section">
                <div class="admin-section-header">
                    <h2>Články <span class="admin-count">${articles.length}</span></h2>
                    <a href="/admin/clanek/new" class="btn btn-primary btn-sm">+ Nový článek</a>
                </div>

                <table class="admin-table">
                    <thead><tr><th>Název</th><th>Úvodní</th><th>Pořadí</th><th>Akce</th></tr></thead>
                    <tbody>
                    ${articles.map(function (a) {
                        return '<tr>'
                            + '<td data-label="Název"><a href="/clanek/' + esc(a.slug) + '">' + esc(a.title) + '</a></td>'
                            + '<td data-label="Úvodní">' + (a.is_intro ? '✓' : '') + '</td>'
                            + '<td data-label="Pořadí">' + a.sort_order + '</td>'
                            + '<td data-label="Akce" class="admin-actions">'
                            + '<a href="/admin/clanek/' + esc(a.slug) + '/edit" class="btn-sm">Upravit</a> '
                            + confirmDeleteForm('/admin/clanek/' + a.id + '/delete', 'článek „' + a.title + '"', '<button class="btn-sm btn-danger">Smazat</button>')
                            + '</td></tr>';
                    }).join('')}
                    </tbody>
                </table>
            </div>

            <div class="admin-section">
                <div class="admin-section-header">
                    <h2>Uživatelé <span class="admin-count">${users.length}</span></h2>
                </div>

                <form method="POST" action="/admin/user/create" class="admin-inline-form" autocomplete="off">
                    <input name="new_username" placeholder="Login" required autocomplete="off" autocapitalize="none" spellcheck="false" />
                    <input name="display_name" placeholder="Jméno" required autocomplete="off" />
                    <input name="new_user_password" type="password" placeholder="Heslo" required autocomplete="new-password" />
                    <label class="checkbox-label"><input type="checkbox" name="is_admin" value="1" /> Admin</label>
                    <button class="btn btn-primary">+ Přidat uživatele</button>
                </form>

                <table class="admin-table">
                    <thead><tr><th>Login</th><th>Jméno</th><th>Nové heslo</th><th>Admin</th><th>Komentářů</th><th>Akce</th></tr></thead>
                    <tbody>${users.map(function (u) {
                        var cc = commentCounts[u.id] || 0;
                        var delBtn = u.id === user.id
                            ? '<span class="admin-actions-note">aktuální uživatel</span>'
                            : confirmDeleteForm(
                                '/admin/user/' + u.id + '/delete',
                                'uživatele „' + u.display_name + '"' + (cc ? ' i s jeho ' + cc + ' komentáři' : ''),
                                '<button class="btn-sm btn-danger">Smazat</button>');
                        return '<tr>'
                            + '<td data-label="Login"><code>' + esc(u.username) + '</code></td>'
                            + '<td data-label="Jméno"><input form="user-edit-' + u.id + '" name="display_name" value="' + esc(u.display_name) + '" required autocomplete="off" /></td>'
                            + '<td data-label="Nové heslo"><input form="user-edit-' + u.id + '" name="new_password" type="password" placeholder="beze změny" autocomplete="new-password" /></td>'
                            + '<td data-label="Admin"><label class="checkbox-label"><input form="user-edit-' + u.id + '" type="checkbox" name="is_admin" value="1"' + (u.is_admin ? ' checked' : '') + ' /> ✓</label></td>'
                            + '<td data-label="Komentářů">' + cc + '</td>'
                            + '<td data-label="Akce" class="admin-actions"><button form="user-edit-' + u.id + '" class="btn-sm">Uložit</button> ' + delBtn + '</td>'
                            + '</tr>';
                    }).join('')}</tbody>
                </table>
                ${users.map(function (u) {
                    return '<form id="user-edit-' + u.id + '" method="POST" action="/admin/user/' + u.id + '/edit" autocomplete="off"></form>';
                }).join('')}
            </div>
        </div>
    </section>`;
    res.send(adminLayout('Admin', body, req));
});

// ── Albums: create + edit + editor page ────────────────────
router.post('/album/create', requireAdmin, function (req, res) {
    var id = (req.body.id || '').trim();
    var title = (req.body.title || '').trim();
    if (!safeAlbumId(id) || !title) return res.redirect('/admin');
    fs.mkdirSync(path.join(FOTO_DIR, id), { recursive: true });
    db.prepare(`INSERT INTO albums (id, title, subtitle, sort_order) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title,
            subtitle = excluded.subtitle,
            sort_order = excluded.sort_order`)
        .run(id, title, req.body.subtitle || '', parseInt(id) || 0);
    invalidateSync();
    res.redirect('/admin');
});

router.post('/album/:id/edit', requireAdmin, function (req, res) {
    var sortOrder = req.body.sort_order !== undefined && req.body.sort_order !== ''
        ? parseInt(req.body.sort_order) || 0
        : null;
    if (sortOrder !== null) {
        db.prepare('UPDATE albums SET title = ?, subtitle = ?, sort_order = ? WHERE id = ?')
            .run(req.body.title || req.params.id, req.body.subtitle || '', sortOrder, req.params.id);
    } else {
        db.prepare('UPDATE albums SET title = ?, subtitle = ? WHERE id = ?')
            .run(req.body.title || req.params.id, req.body.subtitle || '', req.params.id);
    }
    res.redirect('/admin/album/' + req.params.id);
});

router.get('/album/:id', requireAdminPage, function (req, res) {
    var albumId = req.params.id;
    var album = db.prepare('SELECT * FROM albums WHERE id = ?').get(albumId);
    if (!album) {
        return res.status(404).send(adminLayout('Nenalezeno',
            '<section class="page-header"><div class="container"><h1>Album nenalezeno</h1></div></section>' +
            '<section class="section"><div class="container"><p><a href="/admin">← zpět na admin</a></p></div></section>', req));
    }
    var photos = getPhotos(albumId);
    var videos = getVideos(albumId);
    var thumbSet = getThumbSet(albumId);
    var isProtected = !!PROTECTED_ALBUMS[albumId];
    var isLandingPhotos = albumId === 'titulni_strana';
    var subtitle = albumSubtitle(album);
    var summaryParts = [];
    if (subtitle) summaryParts.push(subtitle);
    summaryParts.push(helpers.photoCountText(photos.length));
    if (videos.length) summaryParts.push(videos.length + ' videí');
    var body = `
    <section class="page-header">
        <div class="container">
            <p class="page-header-crumb"><a href="/admin">← zpět na admin</a></p>
            <h1>Album: ${esc(album.title)}</h1>
            <p>${esc(summaryParts.join(' · '))}</p>
            ${isLandingPhotos ? '<p class="page-header-note">Fotky v tomto albu se zobrazují na <strong>domovské stránce</strong> – v úvodním slideshow a jako náhledy u příběhu (první čtyři).</p>' : ''}
        </div>
    </section>

    <section class="section">
        <div class="container">

            <div class="admin-section">
                <div class="admin-section-header"><h2>Základní údaje</h2></div>
                <form method="POST" action="/admin/album/${esc(albumId)}/edit" class="admin-inline-form admin-inline-form-stacked">
                    <label>Název</label>
                    <input name="title" value="${esc(album.title)}" required />
                    <label>Místo / podtitulek</label>
                    <input name="subtitle" value="${esc(subtitle)}" />
                    <label>Pořadí <span class="form-hint">(vyšší číslo = dřív)</span></label>
                    <input name="sort_order" type="number" value="${album.sort_order}" />
                    <div>
                        <button class="btn btn-primary">Uložit změny</button>
                        <a href="/galerie/${esc(albumId)}" class="btn">Zobrazit veřejně</a>
                    </div>
                </form>
            </div>

            <div class="admin-section">
                <div class="admin-section-header"><h2>Nahrát fotky</h2></div>
                <form id="album-upload-form" method="POST" action="/admin/album/${esc(albumId)}/upload" enctype="multipart/form-data" class="admin-inline-form">
                    <input type="file" name="photos" id="album-upload-files" multiple accept="image/jpeg,image/png,image/gif,image/webp,video/mp4" required />
                    <button type="submit" class="btn btn-primary" id="album-upload-btn">Nahrát</button>
                </form>
                <div id="album-upload-progress" class="upload-progress" hidden>
                    <div class="upload-progress-bar"><div class="upload-progress-fill" id="album-progress-fill"></div></div>
                    <p class="upload-progress-text" id="album-progress-text"></p>
                </div>
            </div>

            <div class="admin-section">
                <div class="admin-section-header"><h2>Fotky <span class="admin-count">${photos.length}</span></h2></div>
                ${photos.length === 0
                    ? '<p class="form-hint">V albu zatím nejsou žádné fotky.</p>'
                    : '<div class="admin-photo-grid">' + photos.map(function (f) {
                        var isCover = album.cover_photo === f;
                        return '<div class="admin-photo' + (isCover ? ' is-cover' : '') + '">'
                            + '<img src="' + thumbPath(albumId, f, thumbSet) + '" alt="" loading="lazy" />'
                            + (isCover ? '<span class="admin-photo-badge">Titulní</span>' : '')
                            + '<div class="admin-photo-actions">'
                            + '<form method="POST" action="/admin/album/' + esc(albumId) + '/cover" class="inline-form">'
                            + '<input type="hidden" name="filename" value="' + esc(f) + '" />'
                            + '<button title="Nastavit jako titulní fotku" aria-label="Nastavit jako titulní fotku" class="admin-photo-btn">★</button></form>'
                            + confirmDeleteForm('/admin/album/' + esc(albumId) + '/photo/delete',
                                'fotku ' + f,
                                '<button title="Smazat fotku" aria-label="Smazat fotku" class="admin-photo-btn admin-photo-btn-danger">×</button>',
                                { filename: f })
                            + '</div>'
                            + '<span class="admin-photo-name">' + esc(f) + '</span>'
                            + '</div>';
                    }).join('') + '</div>'
                }
            </div>

            ${videos.length ? `
            <div class="admin-section">
                <div class="admin-section-header"><h2>Videa <span class="admin-count">${videos.length}</span></h2></div>
                <ul class="admin-video-list">
                    ${videos.map(function (v) {
                        return '<li><code>' + esc(v) + '</code> '
                            + confirmDeleteForm('/admin/album/' + esc(albumId) + '/photo/delete',
                                'video ' + v,
                                '<button class="btn-sm btn-danger">Smazat</button>',
                                { filename: v })
                            + '</li>';
                    }).join('')}
                </ul>
            </div>` : ''}

            ${isProtected ? `
            <div class="admin-section">
                <div class="admin-section-header"><h2>Systémové album</h2></div>
                <p>Toto album je chráněno před smazáním, protože se používá jinde na webu. Jednotlivé fotky můžeš mazat i přidávat běžně.</p>
            </div>` : `
            <div class="admin-section admin-danger">
                <div class="admin-section-header"><h2>Nebezpečná zóna</h2></div>
                <p>Smazáním alba se nevratně odstraní všechny fotky, videa i jejich náhledy z disku i z databáze.</p>
                <form method="POST" action="/admin/album/${esc(albumId)}/delete" data-confirm-id="${esc(albumId)}">
                    <button class="btn btn-danger">Smazat celé album</button>
                </form>
            </div>`}

        </div>
    </section>

    `;
    res.send(adminLayout('Album – ' + album.title, body, req, { scripts: ['/js/admin.js'] }));
});

function wantsJson(req) {
    return req.get('X-Requested-With') === 'XMLHttpRequest'
        || (req.get('Accept') || '').indexOf('application/json') !== -1;
}

function finishUpload(req, res, albumId, status, message) {
    if (wantsJson(req)) return res.status(status).json(status >= 400 ? { error: message } : { message: message });
    if (status >= 400) return res.status(status).send(adminLayout('Chyba při nahrávání',
        '<section class="section"><div class="container"><p>' + esc(message) + '</p><p><a href="/admin/album/' + esc(albumId) + '">Zpět na album</a></p></div></section>', req));
    res.redirect('/admin/album/' + albumId);
}

router.post('/album/:id/upload', requireAdmin, function (req, res) {
    var albumId = req.params.id;
    if (!safeAlbumId(albumId)) return finishUpload(req, res, albumId, 400, 'Neplatné ID alba.');

    photoUpload.array('photos', 100)(req, res, function (err) {
        if (err) return finishUpload(req, res, albumId, 400, err.message || 'Soubor se nepodařilo nahrát.');

        var files = req.files || [];
        Promise.all(files.map(function (f) { return generateResized(albumId, f.filename); }))
            .then(function () {
                invalidateCache(albumId);
                finishUpload(req, res, albumId, 200, 'Nahráno ' + files.length + ' souborů.');
            })
            .catch(function (e) {
                finishUpload(req, res, albumId, 500, e.message || 'Náhledy se nepodařilo vygenerovat.');
            });
    });
});

router.post('/album/:id/photo/delete', requireAdmin, function (req, res) {
    var albumId = req.params.id;
    var filename = (req.body.filename || '').trim();
    if (!safeAlbumId(albumId) || !safeFilename(filename)) return res.redirect('/admin');
    try { fs.unlinkSync(path.join(FOTO_DIR, albumId, filename)); } catch (e) { }
    removeThumb(albumId, filename);
    invalidateCache(albumId);
    var album = db.prepare('SELECT cover_photo FROM albums WHERE id = ?').get(albumId);
    if (album && album.cover_photo === filename) {
        db.prepare('UPDATE albums SET cover_photo = ? WHERE id = ?').run('', albumId);
    }
    res.redirect('/admin/album/' + albumId);
});

router.post('/album/:id/cover', requireAdmin, function (req, res) {
    var albumId = req.params.id;
    var filename = (req.body.filename || '').trim();
    if (!safeAlbumId(albumId) || !safeFilename(filename)) return res.redirect('/admin');
    db.prepare('UPDATE albums SET cover_photo = ? WHERE id = ?').run(filename, albumId);
    res.redirect('/admin/album/' + albumId);
});

router.post('/album/:id/delete', requireAdmin, function (req, res) {
    var albumId = req.params.id;
    if (!safeAlbumId(albumId) || PROTECTED_ALBUMS[albumId]) return res.redirect('/admin');
    try { fs.rmSync(path.join(FOTO_DIR, albumId), { recursive: true, force: true }); } catch (e) { }
    try { fs.rmSync(path.join(THUMB_DIR, albumId), { recursive: true, force: true }); } catch (e) { }
    try { fs.rmSync(path.join(DISPLAY_DIR, albumId), { recursive: true, force: true }); } catch (e) { }
    db.prepare('DELETE FROM albums WHERE id = ?').run(albumId);
    invalidateCache(albumId);
    invalidateSync();
    res.redirect('/admin');
});

// ── Users ──────────────────────────────────────────────────
router.post('/user/create', requireAdmin, function (req, res) {
    var u = (req.body.new_username || '').trim();
    var d = (req.body.display_name || '').trim();
    var p = req.body.new_user_password || '';
    if (!u || !d || !p) return res.redirect('/admin');
    try {
        db.prepare('INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?)')
            .run(u, d, bcrypt.hashSync(p, 10), req.body.is_admin ? 1 : 0);
    } catch (e) { }
    res.redirect('/admin');
});

router.post('/user/:id/edit', requireAdmin, function (req, res) {
    var id = parseInt(req.params.id);
    if (!id) return res.redirect('/admin');
    var displayName = (req.body.display_name || '').trim();
    var newPassword = (req.body.new_password || '').trim();
    var isAdmin = req.body.is_admin ? 1 : 0;

    // Prevent admin from stripping their own admin rights (would lock them out after session expires)
    if (id === req.session.userId) isAdmin = 1;

    if (displayName) {
        db.prepare('UPDATE users SET display_name = ?, is_admin = ? WHERE id = ?')
            .run(displayName, isAdmin, id);
    }
    if (newPassword) {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            .run(bcrypt.hashSync(newPassword, 10), id);
    }
    res.redirect('/admin');
});

router.post('/user/:id/delete', requireAdmin, function (req, res) {
    var id = parseInt(req.params.id);
    if (!id || id === req.session.userId) return res.redirect('/admin');
    var tx = db.transaction(function () {
        db.prepare('DELETE FROM comments WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
    tx();
    res.redirect('/admin');
});

// ── Article image upload (for Quill editor) ──────────────────
router.post('/article-image/upload', requireAdmin, articleImageUpload.single('image'), function (req, res) {
    if (!req.file) return res.status(400).json({ error: 'Žádný soubor' });
    res.json({ url: '/obrazky/articles/' + req.file.filename });
});

// ── Articles CRUD ──────────────────────────────────────────
function renderArticleForm(article) {
    var isNew = !article;
    var a = article || { title: '', meta: '', icon: '', content: '', is_intro: 0, sort_order: 0 };
    var iconBlock = a.icon
        ? `<div class="article-form-icon-preview">
               <img src="${esc(a.icon)}" alt="" />
               <label class="checkbox-label">
                   <input type="checkbox" name="icon_clear" value="1" /> Odstranit aktuální obrázek
               </label>
           </div>`
        : '';
    return `
    <section class="page-header"><div class="container"><h1>${isNew ? 'Nový článek' : 'Upravit článek'}</h1></div></section>
    <section class="section">
        <div class="container container-narrow">
            <form id="article-editor-form" method="POST" action="/admin/clanek/save" enctype="multipart/form-data" class="article-form">
                ${isNew ? '' : '<input type="hidden" name="id" value="' + a.id + '" />'}
                <label>Název *</label>
                <input name="title" value="${esc(a.title)}" required />

                <label>Podtitulek / meta <span class="form-hint">(např. „Od Pecolda · 12. 6. 2000")</span></label>
                <input name="meta" value="${esc(a.meta)}" />

                <label>Ikonka <span class="form-hint">(volitelný obrázek – JPG / PNG / GIF / WebP / SVG, do 5 MB)</span></label>
                ${iconBlock}
                <input name="icon_file" type="file" accept="image/jpeg,image/png,image/gif,image/webp" />

                <label>Obsah článku</label>
                <div id="quill-editor-container">${a.content}</div>
                <textarea id="article-content-fallback" name="content" rows="22" hidden>${esc(a.content)}</textarea>
                <noscript><style>#quill-editor-container{display:none}#article-content-fallback{display:block!important}</style></noscript>

                <p class="form-hint">Úryvek pro seznam článků a domovskou stránku se generuje automaticky z prvních vět obsahu.</p>

                <div class="article-form-row">
                    <label class="checkbox-label">
                        <input type="checkbox" name="is_intro" value="1"${a.is_intro ? ' checked' : ''} />
                        Úvodní článek (zobrazen na domovské stránce v sekci „Příběh")
                    </label>
                </div>

                <label>Pořadí <span class="form-hint">(vyšší číslo = výš v seznamu)</span></label>
                <input name="sort_order" type="number" value="${a.sort_order}" />

                <div class="article-form-actions">
                    <button class="btn btn-primary" type="submit">${isNew ? 'Vytvořit článek' : 'Uložit změny'}</button>
                    <a href="/admin" class="btn">Zrušit</a>
                </div>
            </form>
        </div>
    </section>`;
}

var articleEditorAssets = {
    extraHead: '<link href="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css" rel="stylesheet" />',
    extraScripts: '<script src="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js"></script>',
    scripts: ['/js/admin.js']
};

router.get('/clanek/new', requireAdminPage, function (req, res) {
    res.send(adminLayout('Nový článek', renderArticleForm(null), req, articleEditorAssets));
});

router.get('/clanek/:slug/edit', requireAdminPage, function (req, res) {
    var article = getArticle(req.params.slug);
    if (!article) return res.redirect('/admin');
    res.send(adminLayout('Upravit článek', renderArticleForm(article), req, articleEditorAssets));
});

router.post('/clanek/save', requireAdmin, iconUpload.single('icon_file'), function (req, res) {
    var id = req.body.id ? parseInt(req.body.id) : null;
    var title = (req.body.title || '').trim();
    var content = sanitizeArticleHtml((req.body.content || '').trim())
        .replace(/\u00A0/g, ' ');  // Quill uses non-breaking spaces; normalize to regular spaces
    if (!title || !content) {
        if (req.file) removeManagedIcon('/obrazky/articles/' + req.file.filename);
        return res.redirect('/admin');
    }

    var slug;
    var prev = id ? db.prepare('SELECT slug, icon FROM articles WHERE id = ?').get(id) : null;
    if (id && prev) {
        slug = prev.slug;
    } else {
        slug = slugify(title) || ('clanek-' + Date.now());
        var collision = db.prepare('SELECT id FROM articles WHERE slug = ?').get(slug);
        if (collision) slug = slug + '-' + Date.now();
    }

    var meta = (req.body.meta || '').trim();
    var isIntro = req.body.is_intro ? 1 : 0;
    var sortOrder = parseInt(req.body.sort_order) || 0;

    var icon;
    if (req.file) {
        icon = '/obrazky/articles/' + req.file.filename;
        if (prev) removeManagedIcon(prev.icon);
    } else if (req.body.icon_clear) {
        icon = '';
        if (prev) removeManagedIcon(prev.icon);
    } else {
        icon = prev ? prev.icon : '';
    }

    if (isIntro) {
        db.prepare('UPDATE articles SET is_intro = 0 WHERE id != ?').run(id || 0);
    }

    try {
        if (id) {
            db.prepare(`UPDATE articles SET slug = ?, title = ?, meta = ?, icon = ?, content = ?,
                is_intro = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
                .run(slug, title, meta, icon, content, isIntro, sortOrder, id);
        } else {
            db.prepare(`INSERT INTO articles (slug, title, meta, icon, content, is_intro, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
                .run(slug, title, meta, icon, content, isIntro, sortOrder);
        }
    } catch (e) {
        return res.status(500).send(adminLayout('Chyba',
            '<section class="section"><div class="container container-narrow"><h1>Chyba při ukládání</h1><p>' + esc(e.message) + '</p><p><a href="/admin">← zpět</a></p></div></section>',
            req));
    }
    res.redirect('/clanek/' + slug);
});

router.post('/clanek/:id/delete', requireAdmin, function (req, res) {
    var id = parseInt(req.params.id);
    var prev = db.prepare('SELECT icon FROM articles WHERE id = ?').get(id);
    if (prev) removeManagedIcon(prev.icon);
    db.prepare('DELETE FROM articles WHERE id = ?').run(id);
    res.redirect('/admin');
});

module.exports = router;
