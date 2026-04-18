/* ═══════════════════════════════════════════════════════════
   Cementárna v3 – Client JS
   Lightbox · Comments · Scroll effects · Login
   ═══════════════════════════════════════════════════════════ */

(function () {
    // ── Scroll effects ────────────────────────────────────
    var nav = document.getElementById('main-nav');
    if (document.body.classList.contains('page-home') && nav) {
        window.addEventListener('scroll', function () {
            nav.classList.toggle('scrolled', window.scrollY > 60);
        });
    }

    // ── Login ─────────────────────────────────────────────
    window.handleLogin = function (e) {
        e.preventDefault();
        var form = e.target;
        var errEl = document.getElementById('login-error');
        fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: form.username.value, password: form.password.value })
        })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d.user) location.reload();
                else if (errEl) errEl.textContent = d.error || 'Chyba přihlášení';
            });
        return false;
    };

    // ── Lightbox ──────────────────────────────────────────
    var defaultImages = [];      // collected at init from [data-full] elements
    var currentImages = defaultImages;
    var currentIdx = 0;
    var lightbox, lbImg, lbCounter;

    function initLightbox() {
        lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.innerHTML =
            '<span class="lb-close">&times;</span>' +
            '<span class="lb-nav lb-prev">&#8249;</span>' +
            '<img src="" alt="" />' +
            '<span class="lb-nav lb-next">&#8250;</span>' +
            '<span class="lb-counter"></span>';
        document.body.appendChild(lightbox);

        lbImg = lightbox.querySelector('img');
        lbCounter = lightbox.querySelector('.lb-counter');

        lightbox.querySelector('.lb-close').onclick = closeLightbox;
        lightbox.querySelector('.lb-prev').onclick = function (e) { e.stopPropagation(); prevImg(); };
        lightbox.querySelector('.lb-next').onclick = function (e) { e.stopPropagation(); nextImg(); };
        lightbox.onclick = function (e) { if (e.target === lightbox) closeLightbox(); };
        lbImg.onclick = function (e) { e.stopPropagation(); };

        document.addEventListener('keydown', function (e) {
            if (!lightbox.classList.contains('active')) return;
            if (e.key === 'Escape') closeLightbox();
            else if (e.key === 'ArrowLeft') prevImg();
            else if (e.key === 'ArrowRight') nextImg();
        });

        // Collect images
        var thumbs = document.querySelectorAll('[data-full]');
        defaultImages = [];
        for (var i = 0; i < thumbs.length; i++) {
            var src = thumbs[i].getAttribute('data-full');
            defaultImages.push(src);
            (function (idx) {
                thumbs[idx].style.cursor = 'pointer';
                thumbs[idx].addEventListener('click', function (e) {
                    e.preventDefault();
                    openLightbox(idx);
                });
            })(i);
        }
    }

    // openLightbox(idx) uses the default set collected from [data-full] elements.
    // openLightbox(idx, customImages) uses a caller-supplied URL list (e.g. homepage story-photos pool).
    function openLightbox(idx, customImages) {
        currentImages = (customImages && customImages.length) ? customImages : defaultImages;
        currentIdx = idx;
        showImg();
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    window.openLightbox = openLightbox;

    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
        currentImages = defaultImages;
    }

    function prevImg() { currentIdx = (currentIdx - 1 + currentImages.length) % currentImages.length; showImg(); }
    function nextImg() { currentIdx = (currentIdx + 1) % currentImages.length; showImg(); }

    function showImg() {
        lbImg.src = currentImages[currentIdx];
        lbCounter.textContent = (currentIdx + 1) + ' / ' + currentImages.length;
    }

    // ── Comments ──────────────────────────────────────────
    function initComments() {
        var sections = document.querySelectorAll('.comments-section');
        for (var i = 0; i < sections.length; i++) {
            setupComments(sections[i]);
        }
    }

    function setupComments(container) {
        var pageId = container.getAttribute('data-page');
        if (!pageId) return;

        container.innerHTML =
            '<h3 class="comments-title">Komentáře</h3>' +
            '<div class="comments-list"></div>' +
            '<div class="comments-form-area"></div>';

        loadComments(container, pageId);
    }

    function loadComments(container, pageId) {
        fetch('/api/me').then(function (r) { return r.json(); }).then(function (me) {
            var user = me.user;
            fetch('/api/comments/' + encodeURIComponent(pageId))
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var list = container.querySelector('.comments-list');
                    var formArea = container.querySelector('.comments-form-area');

                    if (!user) {
                        list.innerHTML = '<p class="comment-login-prompt">Pro zobrazení komentářů se přihlas.</p>';
                        formArea.innerHTML = '';
                        return;
                    }

                    var comments = data.comments || [];
                    if (comments.length === 0) {
                        list.innerHTML = '<p class="comment-login-prompt">Zatím žádné komentáře. Buď první!</p>';
                    } else {
                        list.innerHTML = comments.map(function (c) {
                            var date = new Date(c.created_at + 'Z');
                            var dateStr = date.toLocaleDateString('cs-CZ') + ' ' + date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
                            var del = (user.id === c.user_id || user.is_admin)
                                ? '<button class="comment-delete" data-cid="' + c.id + '">smazat</button>'
                                : '';
                            return '<div class="comment-item"><div class="comment-header">' + del +
                                '<span class="comment-author">' + esc(c.display_name) + '</span>' +
                                '<span class="comment-date">' + dateStr + '</span></div>' +
                                '<div class="comment-text">' + esc(c.content) + '</div></div>';
                        }).join('');

                        list.querySelectorAll('.comment-delete').forEach(function (btn) {
                            btn.onclick = function () {
                                if (!confirm('Smazat?')) return;
                                fetch('/api/comments/' + btn.getAttribute('data-cid'), { method: 'DELETE' })
                                    .then(function () { loadComments(container, pageId); });
                            };
                        });
                    }

                    formArea.innerHTML =
                        '<div class="comment-form">' +
                        '<textarea placeholder="Napiš komentář... (Ctrl+Enter odešle)"></textarea>' +
                        '<button class="btn btn-primary">Odeslat</button></div>';

                    var ta = formArea.querySelector('textarea');
                    var btn = formArea.querySelector('button');

                    btn.onclick = function () { submitComment(ta, pageId, container); };
                    ta.onkeydown = function (e) { if (e.key === 'Enter' && e.ctrlKey) submitComment(ta, pageId, container); };
                });
        }).catch(function () { });
    }

    function submitComment(ta, pageId, container) {
        var content = ta.value.trim();
        if (!content) return;
        fetch('/api/comments/' + encodeURIComponent(pageId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content })
        }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.comment) { ta.value = ''; loadComments(container, pageId); }
            else alert(d.error || 'Chyba');
        });
    }

    function esc(s) {
        var d = document.createElement('div');
        d.appendChild(document.createTextNode(s || ''));
        return d.innerHTML;
    }

    // ── Init ──────────────────────────────────────────────
    function init() {
        initLightbox();
        initComments();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
