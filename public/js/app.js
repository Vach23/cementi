/* ═══════════════════════════════════════════════════════════
   Cementárna v3 – Client JS
   Lightbox · Comments · Scroll effects · Login
   ═══════════════════════════════════════════════════════════ */

(function () {
    var lastModalTrigger = null;
    var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Scroll effects ────────────────────────────────────
    var nav = document.getElementById('main-nav');
    if (document.body.classList.contains('page-home') && nav) {
        window.addEventListener('scroll', function () {
            nav.classList.toggle('scrolled', window.scrollY > 60);
        });
    }

    // ── Navigation + modal ────────────────────────────────
    function initNav() {
        var toggle = document.querySelector('[data-nav-toggle]');
        var menu = document.getElementById('nav-menu');
        if (toggle && menu) {
            toggle.addEventListener('click', function () {
                var open = !menu.classList.contains('open');
                menu.classList.toggle('open', open);
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                toggle.setAttribute('aria-label', open ? 'Zavřít menu' : 'Otevřít menu');
            });
        }

        document.querySelectorAll('[data-open-modal]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                openModal(btn.getAttribute('data-open-modal'), btn);
            });
        });

        document.querySelectorAll('[data-logout]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                btn.disabled = true;
                fetch('/api/logout', { method: 'POST' }).then(function () { location.reload(); });
            });
        });
    }

    function openModal(id, trigger) {
        var modal = document.getElementById(id);
        if (!modal) return;
        lastModalTrigger = trigger || document.activeElement;
        modal.hidden = false;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        var focusTarget = modal.querySelector('input, button, textarea, select, a[href]');
        if (focusTarget) focusTarget.focus();
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('active');
        modal.hidden = true;
        document.body.style.overflow = '';
        if (lastModalTrigger && typeof lastModalTrigger.focus === 'function') lastModalTrigger.focus();
    }

    function initModals() {
        document.querySelectorAll('.modal').forEach(function (modal) {
            modal.querySelectorAll('[data-close-modal]').forEach(function (btn) {
                btn.addEventListener('click', function () { closeModal(modal); });
            });
        });

        document.addEventListener('keydown', function (e) {
            var modal = document.querySelector('.modal.active');
            if (!modal) return;
            if (e.key === 'Escape') {
                closeModal(modal);
                return;
            }
            if (e.key !== 'Tab') return;

            var focusable = modal.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
            if (!focusable.length) return;
            var first = focusable[0];
            var last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });
    }

    function initLogin() {
        var form = document.getElementById('login-form');
        if (!form) return;
        form.addEventListener('submit', handleLogin);
    }

    function handleLogin(e) {
        e.preventDefault();
        var form = e.target;
        var errEl = document.getElementById('login-error');
        if (errEl) errEl.textContent = '';
        fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: form.username.value, password: form.password.value })
        })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d.user) location.reload();
                else if (errEl) errEl.textContent = d.error || 'Chyba přihlášení';
            })
            .catch(function () {
                if (errEl) errEl.textContent = 'Chyba připojení';
            });
        return false;
    }

    function initConfirmForms() {
        document.querySelectorAll('form[data-confirm-id]').forEach(function (form) {
            form.addEventListener('submit', function (e) {
                var expected = form.getAttribute('data-confirm-id');
                var typed = prompt('Pro potvrzení napiš ID "' + expected + '":');
                if (typed !== expected) e.preventDefault();
            });
        });

        document.querySelectorAll('form[data-confirm]').forEach(function (form) {
            form.addEventListener('submit', function (e) {
                if (!confirm(form.getAttribute('data-confirm'))) e.preventDefault();
            });
        });
    }

    function initHeroSlideshow() {
        var container = document.getElementById('hero-slideshow');
        if (!container) return;
        var allUrls;
        try { allUrls = JSON.parse(container.getAttribute('data-slides')); } catch (e) { return; }
        if (!allUrls || allUrls.length < 2) return;
        if (prefersReducedMotion) return;

        var slides = [container.querySelector('.hero-slide')];
        var overlay = container.querySelector('.hero-overlay');
        var idx = 0;
        var preloaded = {};
        preloaded[allUrls[0]] = true;

        function preloadNext(nextIdx) {
            var url = allUrls[nextIdx];
            if (preloaded[url]) return;
            var img = new Image();
            img.src = url;
            preloaded[url] = true;
        }

        function getOrCreateSlide(i) {
            var url = allUrls[i];
            for (var s = 0; s < slides.length; s++) {
                if (slides[s].src.indexOf(url.split('/').pop()) >= 0) return slides[s];
            }
            var el = document.createElement('img');
            el.className = 'hero-slide';
            el.alt = '';
            el.src = url;
            container.insertBefore(el, overlay);
            slides.push(el);
            return el;
        }

        preloadNext(1);
        setInterval(function () {
            var cur = getOrCreateSlide(idx);
            cur.classList.remove('active');
            idx = (idx + 1) % allUrls.length;
            preloadNext((idx + 1) % allUrls.length);
            var next = getOrCreateSlide(idx);
            next.classList.add('active');
        }, 4000);
    }

    function initStoryPhotos() {
        var container = document.querySelector('.story-photos[data-photos]');
        if (!container) return;
        var pool;
        try { pool = JSON.parse(container.getAttribute('data-photos')); } catch (e) { return; }
        if (!pool || pool.length === 0) return;
        var slots = container.querySelectorAll('img');

        slots.forEach(function (img) {
            img.style.cursor = 'pointer';
            img.addEventListener('click', function (e) {
                e.preventDefault();
                var i = parseInt(img.getAttribute('data-photo-index')) || 0;
                if (window.openLightbox) window.openLightbox(i, pool);
            });
        });

        if (prefersReducedMotion || pool.length <= slots.length) return;
        var nextPoolIdx = slots.length;
        var slotToReplace = 0;
        setInterval(function () {
            if (nextPoolIdx >= pool.length) nextPoolIdx = 0;
            var slot = slots[slotToReplace];
            var photoIdx = nextPoolIdx;
            var newSrc = pool[nextPoolIdx];
            slot.style.opacity = '0';
            setTimeout(function () {
                slot.src = newSrc;
                slot.setAttribute('data-photo-index', photoIdx);
                slot.style.opacity = '1';
            }, 600);
            nextPoolIdx++;
            slotToReplace = (slotToReplace + 1) % slots.length;
        }, 6000);
    }

    // ── Lightbox ──────────────────────────────────────────
    var defaultImages = [];      // collected at init from [data-full] elements
    var currentImages = defaultImages;
    var currentIdx = 0;
    var lightbox, lbImg, lbCounter;

    function initLightbox() {
        lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.setAttribute('role', 'dialog');
        lightbox.setAttribute('aria-modal', 'true');
        lightbox.setAttribute('aria-label', 'Prohlížeč fotek');
        lightbox.innerHTML =
            '<button type="button" class="lb-close" aria-label="Zavřít fotku">&times;</button>' +
            '<button type="button" class="lb-nav lb-prev" aria-label="Předchozí fotka">&#8249;</button>' +
            '<img src="" alt="" />' +
            '<button type="button" class="lb-nav lb-next" aria-label="Další fotka">&#8250;</button>' +
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
        lightbox.querySelector('.lb-close').focus();
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
        initNav();
        initModals();
        initLogin();
        initConfirmForms();
        initLightbox();
        initHeroSlideshow();
        initStoryPhotos();
        initComments();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
