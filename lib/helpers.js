// Pure helpers: HTML escaping, slugification, excerpt extraction, filename/id validation.

var IMAGE_RE = /\.(jpe?g|png|gif|webp|heic|heif)$/i;
var VIDEO_RE = /\.(mp4|webm)$/i;

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function slugify(s) {
    return String(s || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function stripHtml(html) {
    return String(html || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function truncateText(text, limit) {
    if (!text) return '';
    if (text.length <= limit) return text;
    var cut = text.slice(0, limit);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > limit * 0.7) cut = cut.slice(0, lastSpace);
    return cut.replace(/[,;:–—-]+$/, '') + '…';
}

function excerptPlain(html, limit) {
    return truncateText(stripHtml(html), limit || 180);
}

// Keeps first top-level blocks up to a char budget. Captures <p>, <h1>-<h6>, and <blockquote>
// (inline children like <em>/<strong>/<a> survive because we keep the outer tag verbatim).
// Appends … to the last block if the article continues.
function excerptRich(html, limit) {
    limit = limit || 450;
    var blocks = String(html || '').match(/<(p|h[1-6]|blockquote)\b[\s\S]*?<\/\1>/gi) || [];
    if (blocks.length === 0) return '<p>' + esc(excerptPlain(html, limit)) + '</p>';
    var out = '';
    var plainLen = 0;
    var truncated = false;
    for (var i = 0; i < blocks.length; i++) {
        var plain = stripHtml(blocks[i]);
        if (out && plainLen + plain.length > limit) { truncated = true; break; }
        out += blocks[i];
        plainLen += plain.length;
        if (plainLen >= limit) { truncated = i < blocks.length - 1; break; }
    }
    if (!out) out = blocks[0];
    if (truncated) out = out.replace(/<\/([a-z][a-z0-9]*)>\s*$/i, '&nbsp;…</$1>');
    return out;
}

function toThumbName(filename) {
    return filename.replace(/\.[^.]+$/, '.webp');
}

function safeFilename(name) {
    return typeof name === 'string' && name.length > 0 && name.length < 200
        && name.indexOf('/') < 0 && name.indexOf('\\') < 0 && name.indexOf('..') < 0;
}

function safeAlbumId(id) {
    return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
}

// Czech plural for "fotografie": 1 fotografie, 2-4 fotografie, 5+ fotografií
function photoCountText(n) {
    if (n === 1) return '1 fotografie';
    if (n >= 2 && n <= 4) return n + ' fotografie';
    return n + ' fotografií';
}

module.exports = {
    IMAGE_RE: IMAGE_RE,
    VIDEO_RE: VIDEO_RE,
    esc: esc,
    slugify: slugify,
    stripHtml: stripHtml,
    truncateText: truncateText,
    excerptPlain: excerptPlain,
    excerptRich: excerptRich,
    toThumbName: toThumbName,
    safeFilename: safeFilename,
    safeAlbumId: safeAlbumId,
    photoCountText: photoCountText
};
