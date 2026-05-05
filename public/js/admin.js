/* Cementi admin interactions: album uploads and article editor. */

(function () {
    function initAlbumUpload() {
        var form = document.getElementById('album-upload-form');
        if (!form) return;

        var fileInput = document.getElementById('album-upload-files');
        var progressWrap = document.getElementById('album-upload-progress');
        var progressFill = document.getElementById('album-progress-fill');
        var progressText = document.getElementById('album-progress-text');
        var uploadBtn = document.getElementById('album-upload-btn');

        var MAX_DIM = 4000;
        var QUALITY = 0.90;
        var WARN_MB = 15;

        function resizeImage(file) {
            return new Promise(function (resolve) {
                if (file.type.indexOf('image/') !== 0) return resolve(file);
                if (file.size < 500 * 1024) return resolve(file);

                var img = new Image();
                var url = URL.createObjectURL(file);
                img.onload = function () {
                    URL.revokeObjectURL(url);
                    var w = img.naturalWidth;
                    var h = img.naturalHeight;
                    if (w <= MAX_DIM && h <= MAX_DIM) return resolve(file);

                    var scale = Math.min(MAX_DIM / w, MAX_DIM / h);
                    var nw = Math.round(w * scale);
                    var nh = Math.round(h * scale);

                    var canvas = document.createElement('canvas');
                    canvas.width = nw;
                    canvas.height = nh;
                    canvas.getContext('2d').drawImage(img, 0, 0, nw, nh);

                    canvas.toBlob(function (blob) {
                        var name = file.name.replace(/\.[^.]+$/, '.jpg');
                        resolve(new File([blob], name, { type: 'image/jpeg' }));
                    }, 'image/jpeg', QUALITY);
                };
                img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
                img.src = url;
            });
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var rawFiles = Array.from(fileInput.files);
            if (!rawFiles.length) return;

            uploadBtn.disabled = true;
            progressWrap.hidden = false;
            progressFill.classList.remove('done', 'error');
            progressFill.style.width = '0%';

            var originalMB = rawFiles.reduce(function (s, f) { return s + f.size; }, 0) / (1024 * 1024);
            progressText.textContent = 'Komprimuju ' + rawFiles.length + ' souborů (' + originalMB.toFixed(1) + ' MB)...';

            Promise.all(rawFiles.map(resizeImage)).then(function (resized) {
                var fd = new FormData();
                var warnings = [];
                var compressedBytes = 0;

                resized.forEach(function (f) {
                    fd.append('photos', f);
                    compressedBytes += f.size;
                    if (f.size > WARN_MB * 1024 * 1024) {
                        warnings.push(f.name + ' (' + (f.size / (1024 * 1024)).toFixed(1) + ' MB)');
                    }
                });

                var compressedMB = compressedBytes / (1024 * 1024);
                var savedPct = originalMB > 0 ? Math.round((1 - compressedMB / originalMB) * 100) : 0;
                var sizeNote = compressedMB.toFixed(1) + ' MB';
                if (savedPct > 5) sizeNote += ' (ušetřeno ' + savedPct + '%)';

                if (warnings.length) {
                    var ok = confirm('Tyto soubory jsou i po kompresi velké:\n\n' + warnings.join('\n') + '\n\nPokračovat v nahrávání?');
                    if (!ok) {
                        uploadBtn.disabled = false;
                        progressWrap.hidden = true;
                        return;
                    }
                }

                progressText.textContent = 'Nahrávám ' + resized.length + ' souborů (' + sizeNote + ')...';

                var xhr = new XMLHttpRequest();
                xhr.open('POST', form.action);
                xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

                xhr.upload.addEventListener('progress', function (ev) {
                    if (!ev.lengthComputable) return;
                    var pct = Math.round((ev.loaded / ev.total) * 100);
                    progressFill.style.width = pct + '%';
                    var loadedMB = (ev.loaded / (1024 * 1024)).toFixed(1);
                    progressText.textContent = 'Nahrávám... ' + pct + '% (' + loadedMB + ' / ' + compressedMB.toFixed(1) + ' MB)';
                });

                xhr.addEventListener('load', function () {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        progressFill.style.width = '100%';
                        progressFill.classList.add('done');
                        try {
                            var d = JSON.parse(xhr.responseText);
                            progressText.textContent = (d.message || 'Hotovo!') + ' Obnovuji stránku...';
                        } catch (err) {
                            progressText.textContent = 'Hotovo! Obnovuji stránku...';
                        }
                        setTimeout(function () { location.reload(); }, 800);
                    } else {
                        progressFill.classList.add('error');
                        progressText.textContent = 'Chyba při nahrávání (HTTP ' + xhr.status + ')';
                        uploadBtn.disabled = false;
                    }
                });

                xhr.addEventListener('error', function () {
                    progressFill.classList.add('error');
                    progressText.textContent = 'Chyba připojení - zkus to znovu.';
                    uploadBtn.disabled = false;
                });

                xhr.send(fd);
            });
        });
    }

    function initArticleEditor() {
        var container = document.getElementById('quill-editor-container');
        var textarea = document.getElementById('article-content-fallback');
        var form = document.getElementById('article-editor-form');
        if (!container || !textarea || !form) return;

        if (typeof Quill === 'undefined') {
            textarea.hidden = false;
            container.hidden = true;
            return;
        }

        var quill = new Quill(container, {
            theme: 'snow',
            placeholder: 'Začněte psát obsah článku...',
            modules: {
                toolbar: [
                    [{ header: [1, 2, 3, false] }],
                    ['bold', 'italic'],
                    ['blockquote'],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['link', 'image'],
                    ['clean']
                ]
            }
        });

        function uploadAndInsert(file) {
            var fd = new FormData();
            fd.append('image', file);
            fetch('/admin/article-image/upload', { method: 'POST', body: fd })
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    if (d.url) {
                        var range = quill.getSelection(true);
                        quill.insertEmbed(range.index, 'image', d.url);
                        quill.setSelection(range.index + 1);
                    } else {
                        alert(d.error || 'Nahrávání selhalo');
                    }
                })
                .catch(function () { alert('Chyba při nahrávání obrázku'); });
        }

        quill.getModule('toolbar').addHandler('image', function () {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/jpeg,image/png,image/gif,image/webp';
            input.addEventListener('change', function () {
                if (input.files && input.files[0]) uploadAndInsert(input.files[0]);
            });
            input.click();
        });

        quill.root.addEventListener('paste', function (e) {
            var items = (e.clipboardData || {}).items;
            if (!items) return;
            for (var i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image/') === 0) {
                    e.preventDefault();
                    uploadAndInsert(items[i].getAsFile());
                    return;
                }
            }
        });

        quill.root.addEventListener('drop', function (e) {
            var files = (e.dataTransfer || {}).files;
            if (!files || !files.length) return;
            for (var i = 0; i < files.length; i++) {
                if (files[i].type.indexOf('image/') === 0) {
                    e.preventDefault();
                    uploadAndInsert(files[i]);
                    return;
                }
            }
        });

        form.addEventListener('submit', function (e) {
            var html = quill.getSemanticHTML();
            textarea.value = (html === '<p><br></p>' || html === '<p></p>' || !html.trim()) ? '' : html;
            if (!textarea.value.trim()) {
                e.preventDefault();
                container.classList.add('quill-error');
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return false;
            }
            container.classList.remove('quill-error');
        });

        quill.on('text-change', function () {
            container.classList.remove('quill-error');
        });
    }

    function init() {
        initAlbumUpload();
        initArticleEditor();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
