// Public-facing pages: homepage, timeline, gallery, articles. Mounted at /.

var express = require('express');
var db = require('../lib/db');
var helpers = require('../lib/helpers');
var auth = require('../lib/auth');
var layoutLib = require('../lib/layout');
var photosLib = require('../lib/photos');
var albumsLib = require('../lib/albums');
var articlesLib = require('../lib/articles');

var esc = helpers.esc;
var excerptPlain = helpers.excerptPlain;
var excerptRich = helpers.excerptRich;
var photoCountText = helpers.photoCountText;

var layout = layoutLib.layout;

var getPhotos = photosLib.getPhotos;
var getVideos = photosLib.getVideos;
var getThumbSet = photosLib.getThumbSet;
var getDisplaySet = photosLib.getDisplaySet;
var thumbPath = photosLib.thumbPath;
var displayPath = photosLib.displayPath;
var getCoverPhoto = photosLib.getCoverPhoto;
var albumMeta = photosLib.albumMeta;

var getAlbums = albumsLib.getAlbums;
var getArticle = articlesLib.getArticle;
var getArticles = articlesLib.getArticles;

var router = express.Router();

function albumSubtitle(album) {
    var meta = albumMeta[album.id] || {};
    return album.subtitle || meta.subtitle || '';
}

router.get('/', function (req, res) {
    var albums = getAlbums();
    var yearAlbums = albums.filter(function (a) { return /^\d{4}$/.test(a.id) && getPhotos(a.id).length > 0; });
    var totalPhotos = 0;
    albums.forEach(function (a) { totalPhotos += getPhotos(a.id).length; });

    var heroPhotos = getPhotos('titulni_strana');
    var heroDisplaySet = getDisplaySet('titulni_strana');
    var heroImages = heroPhotos.map(function (f) { return displayPath('titulni_strana', f, heroDisplaySet); });
    var heroImagesJson = JSON.stringify(heroImages).replace(/'/g, '&apos;');

    var body = `
    <section class="hero">
        <div class="hero-bg hero-slideshow" id="hero-slideshow" data-slides='${heroImagesJson}'>
            ${heroImages.length > 0 ? '<img src="' + heroImages[0] + '" class="hero-slide active" alt="" fetchpriority="high" />' : ''}
            <div class="hero-overlay"></div>
        </div>
        <div class="hero-content">
            <h1>Cementi</h1>
            <p class="hero-subtitle">Spolužáci z VUT Brno · Strojní fakulta · Ročník 1988</p>
            <p class="hero-stat">${yearAlbums.length} srazů · ${photoCountText(totalPhotos)} · Od roku 1993</p>
            <a href="/cas" class="btn btn-hero">Prohlédnout galerie</a>
        </div>
    </section>
    ${(function () {
        var intro = getArticles('intro')[0];
        if (!intro) return '';
        return `
    <section class="section">
        <div class="container">
            <div class="story-grid">
                <div class="story-text">
                    <h2 class="section-title">${esc(intro.title)}</h2>
                    <div class="story-excerpt">${excerptRich(intro.content, 500)}</div>
                    <p class="story-more">
                        <a href="/clanek/${esc(intro.slug)}" class="btn btn-primary">Číst celý příběh →</a>
                    </p>
                </div>
                <div class="story-photos" data-photos='${heroImagesJson}'>
                    ${(function () { var ts = getThumbSet('titulni_strana'); return heroPhotos.slice(0, 4).map(function (f, i) {
                        return '<img src="' + thumbPath('titulni_strana', f, ts) + '" data-photo-index="' + i + '" alt="" loading="lazy" />';
                    }).join(''); })()}
                </div>
            </div>
        </div>
    </section>`;
    })()}

    <section class="section section-dark">
        <div class="container">
            <h2 class="section-title section-title-light">Cementárny v průběhu let</h2>
            <div class="album-board">
                ${yearAlbums.map(function (a) {
                    var count = getPhotos(a.id).length;
                    var cover = getCoverPhoto(a);
                    var sub = albumSubtitle(a);
                    return `<a href="/galerie/${a.id}" class="board-card">
                        <div class="board-card-img" style="background-image:url('${cover}')">
                            <span class="board-card-count">${count}</span>
                        </div>
                        <div class="board-card-body">
                            <strong>${esc(a.title)}</strong>
                            ${sub ? '<small>' + esc(sub) + '</small>' : ''}
                        </div>
                    </a>`;
                }).join('')}
            </div>
            <div class="text-center" style="margin-top:25px">
                <a href="/cas" class="btn btn-outline-light">Zobrazit všechny ročníky</a>
            </div>
        </div>
    </section>

    ${(function () {
        var others = getArticles('non-intro');
        if (!others.length) return '';
        return `
    <section class="section">
        <div class="container">
            <h2 class="section-title">Z archivů Cementů</h2>
            <div class="articles-grid">
                ${others.map(function (a, i) {
                    return '<a href="/clanek/' + esc(a.slug) + '" class="article-card' + (i === 0 && a.icon ? ' article-card-featured' : '') + '">'
                        + (a.icon ? '<div class="article-card-icon"><img src="' + esc(a.icon) + '" alt="" /></div>' : '')
                        + '<div class="article-card-text">'
                        + '<h3>' + esc(a.title) + '</h3>'
                        + '<p>' + esc(excerptPlain(a.content, 150)) + '</p>'
                        + '</div></a>';
                }).join('')}
            </div>
        </div>
    </section>`;
    })()}

    <section class="section section-muted">
        <div class="container container-narrow">
            <div class="comments-section" data-page="index"></div>
        </div>
    </section>
    `;
    res.send(layout('Domů', body, req, { bodyClass: 'page-home' }));
});

router.get('/cas', function (req, res) {
    var albums = getAlbums();
    var yearAlbums = albums.filter(function (a) { return /^\d{4}$/.test(a.id) && getPhotos(a.id).length > 0; });
    var specialAlbums = albums.filter(function (a) {
        return !/^\d{4}$/.test(a.id) && a.id !== 'titulni_strana' && getPhotos(a.id).length > 0;
    });

    var timelineHtml = yearAlbums.map(function (a) {
        var photos = getPhotos(a.id);
        var cover = getCoverPhoto(a);
        var sub = albumSubtitle(a);
        var thumbSet = getThumbSet(a.id);
        var previewPhotos = photos.slice(0, 4).map(function (f) { return thumbPath(a.id, f, thumbSet); });

        return `<div class="tl-item">
            <div class="tl-marker"><span>${esc(a.id)}</span></div>
            <a href="/galerie/${a.id}" class="tl-card">
                <div class="tl-card-cover" style="background-image:url('${cover}')"></div>
                <div class="tl-card-body">
                    <h3>${esc(a.title)}</h3>
                    ${sub ? '<p class="tl-card-sub">' + esc(sub) + '</p>' : ''}
                    <p class="tl-card-count">${photoCountText(photos.length)}</p>
                    <div class="tl-card-previews">
                        ${previewPhotos.map(function (src) {
                            return '<img src="' + src + '" alt="" loading="lazy" />';
                        }).join('')}
                    </div>
                </div>
            </a>
        </div>`;
    }).join('');

    var specialHtml = specialAlbums.map(function (a) {
        var count = getPhotos(a.id).length;
        var cover = getCoverPhoto(a);
        var sub = albumSubtitle(a);
        return `<a href="/galerie/${a.id}" class="special-album-card">
            <div class="special-album-cover" style="background-image:url('${cover}')"></div>
            <div class="special-album-body">
                <h3>${esc(sub || a.title)}</h3>
                <span>${photoCountText(count)}</span>
            </div>
        </a>`;
    }).join('');

    var body = `
    <section class="page-header">
        <div class="container">
            <h1>Cementárny v průběhu let</h1>
            <p>Od prvních srazů v Koryčanech přes Pardubice až po Hrochův Týnec</p>
        </div>
    </section>

    <section class="section">
        <div class="container">
            <div class="timeline">
                <div class="tl-line"></div>
                ${timelineHtml}
            </div>
        </div>
    </section>

    ${specialAlbums.length ? `
    <section class="section section-muted">
        <div class="container">
            <h2 class="section-title">Z dob studia</h2>
            <div class="special-albums-grid">
                ${specialHtml}
            </div>
        </div>
    </section>` : ''}
    `;
    res.send(layout('Časová osa', body, req));
});

router.get('/galerie/:album', function (req, res) {
    var albumId = req.params.album;
    if (!helpers.safeAlbumId(albumId)) return res.status(400).send(layout('Chyba', '<section class="section"><div class="container"><h1>Neplatné album</h1></div></section>', req));
    var album = db.prepare('SELECT * FROM albums WHERE id = ?').get(albumId);
    if (!album) return res.status(404).send(layout('Nenalezeno', '<section class="section"><div class="container"><h1>Album nenalezeno</h1></div></section>', req));

    var photos = getPhotos(albumId);
    var videos = getVideos(albumId);
    var subtitle = albumSubtitle(album);

    var page = parseInt(req.query.s) || 1;
    var perPage = 36;
    var totalPages = Math.ceil(photos.length / perPage);
    var pagePhotos = photos.slice((page - 1) * perPage, page * perPage);

    var pagination = '';
    if (totalPages > 1) {
        pagination = '<div class="pagination">';
        for (var i = 1; i <= totalPages; i++) {
            pagination += i === page
                ? '<span class="pg-current">' + i + '</span>'
                : '<a href="/galerie/' + albumId + '?s=' + i + '">' + i + '</a>';
        }
        pagination += '</div>';
    }

    var videoHtml = videos.map(function (v) {
        return '<div class="video-wrap"><video controls preload="metadata"><source src="/foto/' + esc(albumId) + '/' + esc(v) + '" /></video></div>';
    }).join('');

    var allAlbums = getAlbums().filter(function (a) { return /^\d{4}$/.test(a.id); });
    var idx = allAlbums.findIndex(function (a) { return a.id === albumId; });
    var prevAlbum = idx < allAlbums.length - 1 ? allAlbums[idx + 1] : null;
    var nextAlbum = idx > 0 ? allAlbums[idx - 1] : null;

    var thumbSet = getThumbSet(albumId);
    var dispSet = getDisplaySet(albumId);

    var body = `
    <section class="gallery-header" style="background-image:url('${getCoverPhoto(album)}')">
        <div class="gallery-header-overlay"></div>
        <div class="gallery-header-content">
            <h1>${esc(album.title)}</h1>
            ${subtitle ? '<p>' + esc(subtitle) + '</p>' : ''}
            <span class="gallery-stat">${photoCountText(photos.length)}${videos.length ? ' · ' + videos.length + ' videí' : ''}</span>
        </div>
    </section>

    <section class="section">
        <div class="container">
            ${videoHtml}
            ${pagination}
            <div class="masonry" id="gallery">
                ${pagePhotos.map(function (f) {
                    return '<div class="masonry-item"><img src="' + thumbPath(albumId, f, thumbSet) + '" data-full="' + displayPath(albumId, f, dispSet) + '" alt="" /></div>';
                }).join('')}
            </div>
            ${pagination}

            <div class="album-nav">
                ${prevAlbum ? '<a href="/galerie/' + prevAlbum.id + '" class="album-nav-link album-nav-prev">&larr; ' + esc(prevAlbum.title) + '</a>' : '<span></span>'}
                <a href="/cas" class="album-nav-link">Všechny ročníky</a>
                ${nextAlbum ? '<a href="/galerie/' + nextAlbum.id + '" class="album-nav-link album-nav-next">' + esc(nextAlbum.title) + ' &rarr;</a>' : '<span></span>'}
            </div>
        </div>
    </section>

    <section class="section section-muted">
        <div class="container container-narrow">
            <div class="comments-section" data-page="galerie/${esc(albumId)}"></div>
        </div>
    </section>
    `;
    res.send(layout('Galerie ' + album.title, body, req));
});

router.get('/clanky', function (req, res) {
    var articles = getArticles('non-intro');
    var body = `
    <section class="page-header">
        <div class="container"><h1>Články</h1><p>Z archivů Cementů</p></div>
    </section>
    <section class="section">
        <div class="container container-narrow">
            ${articles.length === 0 ? '<p>Zatím žádné články.</p>' : articles.map(function (a) {
                var preview = excerptPlain(a.content, 220);
                return '<a href="/clanek/' + esc(a.slug) + '" class="article-list-item">'
                    + (a.icon ? '<img src="' + esc(a.icon) + '" alt="" />' : '')
                    + '<div>'
                    + '<h3>' + esc(a.title) + '</h3>'
                    + (a.meta ? '<p class="article-list-meta">' + esc(a.meta) + '</p>' : '')
                    + (preview ? '<p>' + esc(preview) + '</p>' : '')
                    + '</div></a>';
            }).join('')}
        </div>
    </section>`;
    res.send(layout('Články', body, req));
});

router.get('/clanek/:slug', function (req, res) {
    var article = getArticle(req.params.slug);
    if (!article) {
        return res.status(404).send(layout('Nenalezeno',
            '<section class="page-header"><div class="container"><h1>Článek nenalezen</h1></div></section>' +
            '<section class="section"><div class="container container-narrow"><p><a href="/clanky">← zpět na seznam článků</a></p></div></section>',
            req));
    }
    var user = auth.getUser(req);
    var adminBar = (user && user.is_admin)
        ? '<div class="article-admin-bar"><a href="/admin/clanek/' + esc(article.slug) + '/edit" class="btn btn-sm">Upravit článek</a></div>'
        : '';
    var body = `
    <section class="page-header page-header-article">
        <div class="container container-narrow">
            ${article.meta ? '<p class="article-meta">' + esc(article.meta) + '</p>' : ''}
            <h1>${esc(article.title)}</h1>
        </div>
    </section>
    <section class="section">
        <div class="container container-narrow">
            ${adminBar}
            <article class="article-body">${article.content}</article>
            <div class="comments-section" data-page="clanek/${esc(article.slug)}"></div>
        </div>
    </section>`;
    res.send(layout(article.title, body, req));
});

module.exports = router;
