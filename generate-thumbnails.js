// One-off script: generates WebP thumbnails (400x300) for all photos.
// Run: node generate-thumbnails.js
// Safe to re-run — skips files that already have a thumbnail.

var path = require('path');
var fs = require('fs');
var helpers = require('./lib/helpers');
var photosLib = require('./lib/photos');

var FOTO_DIR = photosLib.FOTO_DIR;
var THUMB_DIR = photosLib.THUMB_DIR;

async function generate() {
    var albums;
    try {
        albums = fs.readdirSync(FOTO_DIR).filter(function (d) {
            try { return fs.statSync(path.join(FOTO_DIR, d)).isDirectory(); }
            catch (e) { return false; }
        });
    } catch (e) {
        console.error('Cannot read', FOTO_DIR, e.message);
        return;
    }

    var total = 0;
    var created = 0;

    for (var a of albums) {
        var photos;
        try {
            photos = fs.readdirSync(path.join(FOTO_DIR, a)).filter(function (f) {
                return helpers.IMAGE_RE.test(f);
            });
        } catch (e) { continue; }

        for (var photo of photos) {
            total++;
            var dest = path.join(THUMB_DIR, a, helpers.toThumbName(photo));
            if (fs.existsSync(dest)) continue;

            try {
                await photosLib.generateThumb(a, photo);
                created++;
                if (created % 50 === 0) console.log('  ... ' + created + ' thumbnails created');
            } catch (e) {
                console.error('  Error: ' + photo + ' — ' + e.message);
            }
        }
    }

    console.log('Done! ' + created + ' new thumbnails (' + total + ' total photos)');
}

console.log('Generating thumbnails...');
generate();
