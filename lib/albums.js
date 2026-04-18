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

module.exports = {
    syncAlbums: syncAlbums,
    invalidateSync: invalidateSync,
    getAlbums: getAlbums
};
