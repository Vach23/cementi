// Filesystem-backed helpers for photos, videos, thumbnails, and display-resolution copies.

var fs = require('fs');
var path = require('path');
var sharp = require('sharp');
var helpers = require('./helpers');

var FOTO_DIR = path.join(__dirname, '..', 'public', 'foto');
var THUMB_DIR = path.join(__dirname, '..', 'public', 'thumbs');
var DISPLAY_DIR = path.join(__dirname, '..', 'public', 'display');

var DISPLAY_WIDTH = 2000;
var DISPLAY_QUALITY = 80;

// Cached directory listings — avoids repeated readdirSync when multiple callers
// ask for the same album in a single request cycle (homepage does this ~3× per album).
var fileListCache = {};
var CACHE_TTL = 30000;

function listFiles(albumId, regex, prefix) {
    var key = prefix + albumId;
    var now = Date.now();
    var cached = fileListCache[key];
    if (cached && now - cached.t < CACHE_TTL) return cached.d;
    var dir = path.join(FOTO_DIR, albumId);
    var data;
    try { data = fs.readdirSync(dir).filter(function (f) { return regex.test(f); }).sort(); }
    catch (e) { data = []; }
    fileListCache[key] = { d: data, t: now };
    return data;
}

function getPhotos(albumId) { return listFiles(albumId, helpers.IMAGE_RE, 'p:'); }
function getVideos(albumId) { return listFiles(albumId, helpers.VIDEO_RE, 'v:'); }

function invalidateCache(albumId) {
    if (albumId) {
        delete fileListCache['p:' + albumId];
        delete fileListCache['v:' + albumId];
        delete fileSetCache[THUMB_DIR + ':' + albumId];
        delete fileSetCache[DISPLAY_DIR + ':' + albumId];
    } else {
        fileListCache = {};
        fileSetCache = {};
    }
}

// Generate thumbnail (400×300 cover-crop) for grid/masonry views.
async function generateThumb(albumId, filename) {
    if (!helpers.IMAGE_RE.test(filename)) return;
    var dir = path.join(THUMB_DIR, albumId);
    fs.mkdirSync(dir, { recursive: true });
    var dest = path.join(dir, helpers.toThumbName(filename));
    try {
        await sharp(path.join(FOTO_DIR, albumId, filename))
            .resize(400, 300, { fit: 'cover' }).webp({ quality: 75 }).toFile(dest);
    } catch (e) {
        console.error('thumb error', filename, e.message);
    }
}

// Generate display copy (2000px wide, aspect-preserved) for lightbox + hero.
async function generateDisplay(albumId, filename) {
    if (!helpers.IMAGE_RE.test(filename)) return;
    var dir = path.join(DISPLAY_DIR, albumId);
    fs.mkdirSync(dir, { recursive: true });
    var dest = path.join(dir, helpers.toThumbName(filename));
    try {
        await sharp(path.join(FOTO_DIR, albumId, filename))
            .resize(DISPLAY_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: DISPLAY_QUALITY })
            .toFile(dest);
    } catch (e) {
        console.error('display error', filename, e.message);
    }
}

// Generate both thumb + display in one call (used by upload handler).
async function generateResized(albumId, filename) {
    await Promise.all([
        generateThumb(albumId, filename),
        generateDisplay(albumId, filename)
    ]);
}

function removeThumb(albumId, filename) {
    var webp = helpers.toThumbName(filename);
    try { fs.unlinkSync(path.join(THUMB_DIR, albumId, webp)); } catch (e) { }
    try { fs.unlinkSync(path.join(DISPLAY_DIR, albumId, webp)); } catch (e) { }
}

var fileSetCache = {};
var FILE_SET_TTL = 30000;

function getFileSet(baseDir, albumId) {
    var key = baseDir + ':' + albumId;
    var now = Date.now();
    var cached = fileSetCache[key];
    if (cached && now - cached.t < FILE_SET_TTL) return cached.d;
    var data;
    try { data = new Set(fs.readdirSync(path.join(baseDir, albumId))); }
    catch (e) { data = new Set(); }
    fileSetCache[key] = { d: data, t: now };
    return data;
}

function getThumbSet(albumId) { return getFileSet(THUMB_DIR, albumId); }
function getDisplaySet(albumId) { return getFileSet(DISPLAY_DIR, albumId); }

function versionSuffix(filePath) {
    try { return '?v=' + Math.floor(fs.statSync(filePath).mtimeMs); }
    catch (e) { return ''; }
}

function resolvedPath(baseDir, urlPrefix, albumId, photo, fileSet) {
    var webpName = helpers.toThumbName(photo);
    var resizedPath = path.join(baseDir, albumId, webpName);
    var originalPath = path.join(FOTO_DIR, albumId, photo);
    var present = fileSet
        ? fileSet.has(webpName)
        : fs.existsSync(resizedPath);
    return present
        ? urlPrefix + albumId + '/' + webpName + versionSuffix(resizedPath)
        : '/foto/' + albumId + '/' + photo + versionSuffix(originalPath);
}

function thumbPath(albumId, photo, thumbSet) {
    return resolvedPath(THUMB_DIR, '/thumbs/', albumId, photo, thumbSet);
}

function displayPath(albumId, photo, displaySet) {
    return resolvedPath(DISPLAY_DIR, '/display/', albumId, photo, displaySet);
}

function getCoverPhoto(album, albumPhotos) {
    var ts = getThumbSet(album.id);
    if (album.cover_photo) return thumbPath(album.id, album.cover_photo, ts);
    var photos = albumPhotos || getPhotos(album.id);
    if (photos.length > 0) return thumbPath(album.id, photos[Math.floor(photos.length / 3)], ts);
    return '/obrazky/cement.jpg';
}

module.exports = {
    FOTO_DIR: FOTO_DIR,
    THUMB_DIR: THUMB_DIR,
    DISPLAY_DIR: DISPLAY_DIR,
    getPhotos: getPhotos,
    getVideos: getVideos,
    invalidateCache: invalidateCache,
    generateThumb: generateThumb,
    generateDisplay: generateDisplay,
    generateResized: generateResized,
    removeThumb: removeThumb,
    getThumbSet: getThumbSet,
    getDisplaySet: getDisplaySet,
    thumbPath: thumbPath,
    displayPath: displayPath,
    getCoverPhoto: getCoverPhoto
};
