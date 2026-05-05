// One-off script: generates missing WebP thumbnails and display copies for all photos.
// Run: node generate-thumbnails.js
// Safe to re-run: skips files whose derived assets already exist.

var path = require('path');
var fs = require('fs');
var helpers = require('./lib/helpers');
var photosLib = require('./lib/photos');

var FOTO_DIR = photosLib.FOTO_DIR;
var THUMB_DIR = photosLib.THUMB_DIR;
var DISPLAY_DIR = photosLib.DISPLAY_DIR;

function albumDirs() {
    try {
        return fs.readdirSync(FOTO_DIR).filter(function (d) {
            try { return fs.statSync(path.join(FOTO_DIR, d)).isDirectory(); }
            catch (e) { return false; }
        });
    } catch (e) {
        console.error('Cannot read', FOTO_DIR, e.message);
        return [];
    }
}

function albumPhotos(albumId) {
    try {
        return fs.readdirSync(path.join(FOTO_DIR, albumId)).filter(function (f) {
            return helpers.IMAGE_RE.test(f);
        });
    } catch (e) {
        return [];
    }
}

async function generate() {
    var albums = albumDirs();

    var total = 0;
    var thumbs = 0;
    var displays = 0;
    var errors = 0;

    for (var a of albums) {
        for (var photo of albumPhotos(a)) {
            total++;
            var webp = helpers.toThumbName(photo);

            try {
                if (!fs.existsSync(path.join(THUMB_DIR, a, webp))) {
                    await photosLib.generateThumb(a, photo);
                    thumbs++;
                }
                if (!fs.existsSync(path.join(DISPLAY_DIR, a, webp))) {
                    await photosLib.generateDisplay(a, photo);
                    displays++;
                }
                if ((thumbs + displays) > 0 && (thumbs + displays) % 50 === 0) {
                    console.log('  ... ' + thumbs + ' thumbnails, ' + displays + ' display copies created');
                }
            } catch (e) {
                errors++;
                console.error('  Error: ' + a + '/' + photo + ' - ' + e.message);
            }
        }
    }

    console.log('Done! ' + thumbs + ' new thumbnails, ' + displays + ' new display copies (' + total + ' total photos, ' + errors + ' errors)');
}

console.log('Generating photo assets...');
generate();
