// Album DAO — wraps the SQLite `albums` table and picks up any new directory found under public/foto/.

var fs = require('fs');
var path = require('path');
var db = require('./db');
var photos = require('./photos');

// Default titles for known special album IDs; regular year dirs (e.g. "2015") fall back to the dir name.
var DEFAULT_TITLES = {
    'titulni_strana': 'Domovská stránka',
    'puleni': 'Půlení studia',
    'carodky1988': 'Čarodky 1988',
    'ostatni': 'Ostatní'
};

var lastSyncTime = 0;
var SYNC_TTL_MS = 60 * 1000;

var ALBUM_META = {
    '1996': { subtitle: 'Koryčany' },
    '1998': { subtitle: 'Koryčany' },
    '1999': { subtitle: 'Koryčany' },
    '2000': { subtitle: 'Koryčany' },
    '2001': { subtitle: 'Pardubice – Lodĕnice' },
    '2002': { subtitle: 'Pardubice – Lodĕnice' },
    '2003': { subtitle: 'Pardubice – Lodĕnice' },
    '2004': { subtitle: 'Pardubice – Lodĕnice' },
    '2005': { subtitle: 'Pardubice – Lodĕnice' },
    '2006': { subtitle: 'Pardubice – Lodĕnice' },
    '2007': { subtitle: 'Pardubice – Lodĕnice' },
    '2008': { subtitle: 'Pardubice – Lodĕnice' },
    '2009': { subtitle: 'Bělá u Luže' },
    '2010': { subtitle: 'Bělá u Luže' },
    '2011': { subtitle: 'Bělá u Luže' },
    '2012': { subtitle: 'Hrochův Týnec' },
    '2013': { subtitle: 'Hrochův Týnec' },
    '2014': { subtitle: 'Hrochův Týnec' },
    '2015': { subtitle: 'Hrochův Týnec' },
    'puleni': { subtitle: 'Půlení a tříčtvrtění studia' },
    'carodky1988': { subtitle: 'Rožnění selátka 1988' },
    'ostatni': { subtitle: 'Různé vzpomínky' },
    'titulni_strana': { subtitle: 'Fotky na domovské stránce' }
};

function syncAlbums() {
    var now = Date.now();
    if (now - lastSyncTime < SYNC_TTL_MS) return;
    lastSyncTime = now;
    var dirs = [];
    try {
        dirs = fs.readdirSync(photos.FOTO_DIR).filter(function (d) {
            try { return fs.statSync(path.join(photos.FOTO_DIR, d)).isDirectory(); }
            catch (e) { return false; }
        });
    } catch (e) { }
    var insert = db.prepare('INSERT OR IGNORE INTO albums (id, title, sort_order) VALUES (?, ?, ?)');
    dirs.forEach(function (d) { insert.run(d, DEFAULT_TITLES[d] || d, parseInt(d) || 0); });
}

// Force-sync (call after admin creates/deletes an album to reset the TTL cache).
function invalidateSync() {
    lastSyncTime = 0;
}

function getAlbums() {
    syncAlbums();
    return db.prepare('SELECT * FROM albums ORDER BY sort_order DESC, id DESC').all();
}

function isYearAlbum(album) {
    return /^\d{4}$/.test(album.id);
}

function albumSubtitle(album) {
    var meta = ALBUM_META[album.id] || {};
    return album.subtitle || meta.subtitle || '';
}

function albumView(album, opts) {
    opts = opts || {};
    var albumPhotos = photos.getPhotos(album.id);
    var videos = opts.includeVideos ? photos.getVideos(album.id) : [];
    return {
        album: album,
        photos: albumPhotos,
        videos: videos,
        photoCount: albumPhotos.length,
        videoCount: videos.length,
        subtitle: albumSubtitle(album),
        cover: photos.getCoverPhoto(album, albumPhotos)
    };
}

function albumViews(albums, opts) {
    return albums.map(function (album) { return albumView(album, opts); });
}

module.exports = {
    syncAlbums: syncAlbums,
    invalidateSync: invalidateSync,
    getAlbums: getAlbums,
    isYearAlbum: isYearAlbum,
    albumSubtitle: albumSubtitle,
    albumView: albumView,
    albumViews: albumViews,
    ALBUM_META: ALBUM_META
};
