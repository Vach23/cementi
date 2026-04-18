// Article DAO. Seeds the `articles` table from data/articles/ on first run (only if the table is empty).

var fs = require('fs');
var path = require('path');
var db = require('./db');

var ARTICLES_DIR = path.join(__dirname, '..', 'data', 'articles');
var MANIFEST_PATH = path.join(ARTICLES_DIR, 'manifest.json');

function getArticle(slug) {
    return db.prepare('SELECT * FROM articles WHERE slug = ?').get(slug);
}

// filter: 'intro' | 'non-intro' | undefined (all)
function getArticles(filter) {
    var sql = 'SELECT * FROM articles';
    if (filter === 'intro') sql += ' WHERE is_intro = 1';
    else if (filter === 'non-intro') sql += ' WHERE is_intro = 0';
    sql += ' ORDER BY sort_order DESC, id ASC';
    return db.prepare(sql).all();
}

function seedArticles() {
    var count = db.prepare('SELECT COUNT(*) AS c FROM articles').get().c;
    if (count > 0) return;

    var manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    } catch (e) {
        console.error('seedArticles: cannot read manifest', e.message);
        return;
    }

    var insert = db.prepare(
        'INSERT INTO articles (slug, title, meta, icon, content, is_intro, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    manifest.forEach(function (entry) {
        var contentPath = path.join(ARTICLES_DIR, entry.slug + '.html');
        var content;
        try {
            content = fs.readFileSync(contentPath, 'utf-8');
        } catch (e) {
            console.error('seedArticles: cannot read', contentPath, e.message);
            return;
        }
        insert.run(
            entry.slug,
            entry.title,
            entry.meta || '',
            entry.icon || '',
            content,
            entry.is_intro ? 1 : 0,
            entry.sort_order || 0
        );
    });
}

module.exports = {
    getArticle: getArticle,
    getArticles: getArticles,
    seedArticles: seedArticles
};
