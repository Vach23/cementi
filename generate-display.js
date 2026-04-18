// One-off script: generates display-resolution WebP copies (2000px wide) for all photos.
// Run: node generate-display.js
// Safe to re-run — skips files that already have a display copy.

var path = require('path');
var fs = require('fs');
var helpers = require('./lib/helpers');
var photosLib = require('./lib/photos');

var FOTO_DIR = photosLib.FOTO_DIR;
var DISPLAY_DIR = photosLib.DISPLAY_DIR;

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
    var errors = 0;

    for (var a of albums) {
        var photos;
        try {
            photos = fs.readdirSync(path.join(FOTO_DIR, a)).filter(function (f) {
                return helpers.IMAGE_RE.test(f);
            });
        } catch (e) { continue; }

        for (var photo of photos) {
            total++;
            var dest = path.join(DISPLAY_DIR, a, helpers.toThumbName(photo));
            if (fs.existsSync(dest)) continue;

            try {
                await photosLib.generateDisplay(a, photo);
                created++;
                if (created % 50 === 0) console.log('  ... ' + created + ' display copies created');
            } catch (e) {
                errors++;
                console.error('  Error: ' + a + '/' + photo + ' — ' + e.message);
            }
        }
    }

    console.log('Done! ' + created + ' new display copies (' + total + ' total photos, ' + errors + ' errors)');
}

console.log('Generating display-resolution copies...');
generate();
