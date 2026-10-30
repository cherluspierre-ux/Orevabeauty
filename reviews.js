/* ==========================================================
   OREVA - avis clients (photos / videos) + bandeau "Disponible chez"
   Les etoiles et le nombre d'avis viennent TOUJOURS des vrais avis
   enregistres : rien n'est invente.
   ========================================================== */
(function () {
  'use strict';

  var O = window.OREVA, CONFIG = O.CONFIG;
  var $ = O.$, $$ = O.$$, esc = O.esc, icon = O.icon, Auth = O.Auth, api = O.api;

  var PAGE = 6, MAX_MEDIA = 5, MAX_VIDEO_MB = 30;
  var state = { summary: { count: 0, avg: 0, dist: [0, 0, 0, 0, 0] }, reviews: [], total: 0, mine: null, canVideo: false, loaded: false };
  var LABELS = ['', 'Décevant', 'Moyen', 'Bien', 'Très bien', 'Excellent'];

  function fnum(n) { return String(n).replace('.', ','); }

  /* ---------- chargement ---------- */
  function load(append) {
    var offset = append ? state.reviews.length : 0;
    return api('GET', '/reviews?limit=' + PAGE + '&offset=' + offset).then(function (r) {
      if (r.status !== 200) throw new Error('reviews');
      var d = r.data;
      state.summary = d.summary; state.total = d.total; state.mine = d.mine; state.canVideo = !!d.canVideo; state.loaded = true;
      state.reviews = append ? state.reviews.concat(d.reviews) : d.reviews;
      render();
    }).catch(function () { state.loaded = true; render(); });
  }

  /* ---------- affichage ---------- */
  function renderRatingLines() {
    var c = state.summary.count;
    $$('[data-rating-line]').forEach(function (e) {
      e.hidden = false;
      e.innerHTML = c
        ? O.stars(state.summary.avg) + '<b>' + fnum(state.summary.avg.toFixed(1)) + '</b><a href="#avis">' + c + ' avis</a>'
        : O.stars(0) + '<a href="#avis">Aucun avis pour l\'instant · soyez le premier</a>';
    });
  }

  function mediaHtml(m) {
    if (m.type === 'video')
      return '<li class="rv-m is-video"><video src="' + esc(m.url) + '" controls playsinline preload="metadata"></video></li>';
    return '<li class="rv-m"><button type="button" data-zoom="' + esc(m.url) + '" aria-label="Agrandir la photo"><img src="' + esc(m.url) + '" alt="Photo jointe à l\'avis" loading="lazy"></button></li>';
  }

  function cardHtml(r) {
    return '<article class="rv" id="rv-' + esc(r.id) + '">' +
      '<header><span class="rv-av">' + O.avatarHtml({ avatar: r.avatar, firstName: r.name }, 52) + '</span>' +
      '<div class="rv-who"><b>' + esc(r.name) + '</b>' +
      (r.verified ? '<span class="rv-badge">' + icon('check') + ' Achat vérifié</span>' : '<span class="rv-badge is-plain">Cliente · client</span>') + '</div>' +
      '<time datetime="' + esc(r.createdAt) + '">' + esc(O.fmtDate(r.createdAt)) + '</time></header>' +
      '<div class="rv-rate">' + O.stars(r.rating) + '<span class="rv-word">' + LABELS[r.rating] + '</span></div>' +
      (r.title ? '<h3 class="rv-title">' + esc(r.title) + '</h3>' : '') +
      '<p class="rv-body">' + esc(r.body) + '</p>' +
      (r.media.length ? '<ul class="rv-media">' + r.media.map(mediaHtml).join('') + '</ul>' : '') +
      (r.edited || r.mine ? '<footer>' + (r.edited ? '<span class="rv-edited">Modifié</span>' : '<span></span>') +
        (r.mine ? '<span class="rv-actions"><button class="link-btn" type="button" data-review-edit>' + icon('edit') + ' Modifier</button><button class="link-btn is-danger" type="button" data-review-delete>' + icon('trash') + ' Supprimer</button></span>' : '') + '</footer>' : '') +
      '</article>';
  }

  function render() {
    renderRatingLines();
    var host = $('[data-reviews]'); if (!host) return;
    var sm = state.summary;
    if (!sm.count) {
      host.innerHTML = '<div class="reviews-empty">' + icon('heart', 'ic-xl') +
        '<h3>Les premiers avis arrivent bientôt</h3>' +
        '<p>Nous publions uniquement de vrais avis de clients. Vous avez essayé le soin ? Racontez-nous, avec une photo ou une vidéo si vous le souhaitez.</p>' +
        '<button class="btn btn-primary" type="button" data-write-review>' + icon('edit') + ' Écrire le premier avis</button></div>';
      return;
    }
    var max = Math.max.apply(null, sm.dist.concat([1]));
    host.innerHTML =
      '<div class="rv-head">' +
      '<div class="rv-score"><b>' + fnum(sm.avg.toFixed(1)) + '</b>' + O.stars(sm.avg, 'lg') + '<span>' + sm.count + ' avis' + (sm.count > 1 ? '' : '') + '</span></div>' +
      '<ul class="rv-dist" aria-label="Répartition des notes">' + sm.dist.map(function (n, i) {
        return '<li><span>' + (5 - i) + ' ★</span><i class="bar"><i style="width:' + Math.round(n / max * 100) + '%"></i></i><em>' + n + '</em></li>';
      }).join('') + '</ul>' +
      '<div class="rv-cta"><p>Vous avez essayé le soin ?</p><button class="btn btn-primary" type="button" data-write-review>' + icon('edit') + ' ' + (state.mine ? 'Modifier mon avis' : 'Écrire un avis') + '</button>' +
      '<small>Photos et vidéos bienvenues</small></div></div>' +
      '<div class="rv-grid">' + state.reviews.map(cardHtml).join('') + '</div>' +
      (state.reviews.length < state.total ? '<div class="rv-more"><button class="btn btn-ghost-dark" type="button" data-reviews-more>Voir plus d\'avis (' + (state.total - state.reviews.length) + ')</button></div>' : '');
  }

  /* ---------- agrandir une photo ---------- */
  function zoom(url) {
    var box = document.createElement('div');
    box.className = 'lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photo agrandie');
    box.innerHTML = '<button class="icon-btn" type="button" aria-label="Fermer">' + icon('close') + '</button><img src="' + esc(url) + '" alt="Photo agrandie">';
    function close() { box.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    box.addEventListener('click', close); document.addEventListener('keydown', onKey);
    document.body.appendChild(box); $('button', box).focus();
  }

  /* ==========================================================
     FENETRE : ecrire / modifier son avis
     ========================================================== */
  var modal = null, form = null;

  function openModal(html, cls) {
    closeModal();
    var ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = '<div class="modal ' + (cls || '') + '" role="dialog" aria-modal="true" tabindex="-1">' +
      '<button class="icon-btn modal-x" type="button" aria-label="Fermer" data-modal-close>' + icon('close') + '</button>' + html + '</div>';
    document.body.appendChild(ov); document.body.classList.add('no-scroll');
    modal = ov;
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) closeModal(); });
    requestAnimationFrame(function () { ov.classList.add('in'); });
    return $('.modal', ov);
  }
  function closeModal() {
    if (!modal) return;
    modal.remove(); modal = null; form = null; document.body.classList.remove('no-scroll');
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  function nextUrl() {
    var p = location.pathname.split('/').pop() || 'index.html';
    return encodeURIComponent(p + '#avis');
  }

  function loginPrompt() {
    var m = openModal(
      '<div class="modal-ic">' + icon('user') + '</div><h2>Connectez-vous pour donner votre avis</h2>' +
      '<p class="muted">Votre avis s\'affichera avec votre prénom et votre photo de profil, pour que les autres clients puissent se fier à de vrais témoignages.</p>' +
      '<div class="modal-actions"><a class="btn btn-primary btn-lg" href="compte.html?next=' + nextUrl() + '">Se connecter</a>' +
      '<a class="btn btn-ghost-dark btn-lg" href="compte.html?mode=signup&amp;next=' + nextUrl() + '">Créer un compte</a></div>');
    $('a', m).focus();
  }

  function openForm() {
    if (!Auth.loaded) { Auth.refresh().then(openForm); return; }
    if (!Auth.user) { loginPrompt(); return; }
    var go = state.loaded ? Promise.resolve() : load();
    go.then(buildForm);
  }

  function buildForm() {
    var u = Auth.user, mine = state.mine;
    var f = { rating: mine ? mine.rating : 0, items: [] };
    if (mine) f.items = mine.media.map(function (m) { return { id: Math.random().toString(36).slice(2), kind: m.type, url: m.url, preview: m.url, status: 'ready' }; });
    var m = openModal(
      '<h2>' + (mine ? 'Modifier mon avis' : 'Votre avis compte') + '</h2>' +
      '<p class="modal-who">' + O.avatarHtml(u, 44) + '<span><b>' + esc(u.firstName + ' ' + u.lastName.charAt(0) + '.') + '</b><small>Publié avec votre photo de profil</small></span></p>' +
      '<form class="rv-form" novalidate>' +
      '<div class="field"><span class="lbl" id="lblRate">Votre note</span>' +
      '<div class="star-pick" role="radiogroup" aria-labelledby="lblRate">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<button type="button" role="radio" aria-checked="false" data-v="' + n + '" aria-label="' + n + ' étoile' + (n > 1 ? 's' : '') + '">' + icon('star') + '</button>';
      }).join('') + '<output class="star-word"></output></div><small class="err" data-err="rating"></small></div>' +
      '<div class="field"><label for="rvTitle">Titre <span class="opt">(facultatif)</span></label><input id="rvTitle" maxlength="80" placeholder="Ex. : Ma peau est plus lumineuse"><small class="err" data-err="title"></small></div>' +
      '<div class="field"><label for="rvBody">Votre avis</label><textarea id="rvBody" rows="5" maxlength="1500" placeholder="Texture, résultats, durée d\'utilisation..."></textarea>' +
      '<div class="field-foot"><small class="err" data-err="body"></small><small class="count"><span data-count>0</span>/1500</small></div></div>' +
      '<div class="field"><span class="lbl">Photos ou vidéo <span class="opt">(facultatif)</span></span>' +
      '<label class="dz" for="rvFiles">' + icon('camera') + '<span><b>Ajouter des photos' + (state.canVideo ? ' ou une vidéo' : '') + '</b><small>' +
      'Jusqu\'à ' + MAX_MEDIA + ' fichiers' + (state.canVideo ? ' · vidéo de ' + MAX_VIDEO_MB + ' Mo max' : '') + '</small></span></label>' +
      '<input id="rvFiles" type="file" class="sr-only" multiple accept="image/*' + (state.canVideo ? ',video/mp4,video/webm,video/quicktime' : '') + '">' +
      '<ul class="rv-previews" data-previews></ul><small class="err" data-err="media"></small>' +
      (state.canVideo ? '' : '<small class="muted">Mode démonstration : seules les photos sont acceptées.</small>') + '</div>' +
      '<p class="co-alert bad" data-alert hidden role="alert"></p>' +
      '<div class="modal-actions"><button class="btn btn-primary btn-lg" type="submit" data-submit>' + (mine ? 'Enregistrer les modifications' : 'Publier mon avis') + '</button>' +
      '<button class="btn btn-ghost-dark btn-lg" type="button" data-modal-close>Annuler</button></div>' +
      '<p class="muted small">En publiant, vous acceptez que votre avis, votre prénom, l\'initiale de votre nom et votre photo de profil soient visibles par tous.</p>' +
      '</form>', 'modal-lg');
    form = $('form', m);
    $('#rvTitle', m).value = mine ? mine.title : '';
    $('#rvBody', m).value = mine ? mine.body : '';

    function paintStars(v) {
      $$('.star-pick button', m).forEach(function (b) {
        var on = parseInt(b.dataset.v, 10) <= v;
        b.classList.toggle('on', on); b.setAttribute('aria-checked', parseInt(b.dataset.v, 10) === f.rating ? 'true' : 'false');
      });
      $('.star-word', m).textContent = v ? LABELS[v] : '';
    }
    function paintCount() { $('[data-count]', m).textContent = $('#rvBody', m).value.length; }
    function paintPreviews() {
      $('[data-previews]', m).innerHTML = f.items.map(function (it) {
        return '<li class="' + (it.status === 'uploading' ? 'is-loading ' : '') + (it.status === 'error' ? 'is-error' : '') + '" data-id="' + it.id + '">' +
          (it.kind === 'video' ? '<video src="' + esc(it.preview) + '" muted preload="metadata"></video><span class="pv-play">' + icon('play') + '</span>' : '<img src="' + esc(it.preview) + '" alt="">') +
          (it.status === 'uploading' ? '<span class="pv-spin"></span>' : '') +
          '<button type="button" data-rm="' + it.id + '" aria-label="Retirer ce fichier">' + icon('close') + '</button></li>';
      }).join('');
      $('[data-submit]', m).disabled = f.items.some(function (i) { return i.status === 'uploading'; });
    }
    function setErr(k, msg) { var e = $('[data-err="' + k + '"]', m); if (e) e.textContent = msg || ''; }

    paintStars(f.rating); paintCount(); paintPreviews();
    $('.star-pick', m).addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]'); if (!b) return;
      f.rating = parseInt(b.dataset.v, 10); paintStars(f.rating); setErr('rating', '');
    });
    $('.star-pick', m).addEventListener('mouseover', function (e) { var b = e.target.closest('button[data-v]'); if (b) paintStars(parseInt(b.dataset.v, 10)); });
    $('.star-pick', m).addEventListener('mouseleave', function () { paintStars(f.rating); });
    $('#rvBody', m).addEventListener('input', function () { paintCount(); setErr('body', ''); });

    $('[data-previews]', m).addEventListener('click', function (e) {
      var b = e.target.closest('button[data-rm]'); if (!b) return;
      f.items = f.items.filter(function (i) { return i.id !== b.dataset.rm; }); paintPreviews(); setErr('media', '');
    });

    $('#rvFiles', m).addEventListener('change', function (e) {
      var files = Array.prototype.slice.call(e.target.files); e.target.value = '';
      files.forEach(function (file) {
        setErr('media', '');
        if (f.items.length >= MAX_MEDIA) return setErr('media', 'Maximum ' + MAX_MEDIA + ' fichiers.');
        var isVideo = /^video\//.test(file.type), isImage = /^image\//.test(file.type);
        if (!isVideo && !isImage) return setErr('media', 'Format non pris en charge : utilisez une photo (JPEG, PNG, WebP) ou une vidéo (MP4, WebM, MOV).');
        if (isVideo) {
          if (!state.canVideo) return setErr('media', 'Les vidéos ne sont pas disponibles en mode démonstration.');
          if (f.items.some(function (i) { return i.kind === 'video'; })) return setErr('media', 'Une seule vidéo par avis.');
          if (file.size > MAX_VIDEO_MB * 1048576) return setErr('media', 'Vidéo trop lourde (' + MAX_VIDEO_MB + ' Mo maximum).');
        }
        var it = { id: Math.random().toString(36).slice(2), kind: isVideo ? 'video' : 'image', url: '', preview: URL.createObjectURL(file), status: 'uploading' };
        f.items.push(it); paintPreviews();
        var job;
        if (isVideo) job = O.uploadFile(file);
        else job = O.fileToJpeg(file, O.mode === 'server' ? 1280 : 800, O.mode === 'server' ? 0.82 : 0.7, false).then(function (d) {
          if (O.mode !== 'server') { it.url = d; it.preview = d; return { status: 201, data: { url: d } }; }
          return O.uploadFile(O.dataUrlToBlob(d));
        });
        job.then(function (r) {
          if (r.status !== 201) throw new Error(String(r.status));
          it.url = r.data.url; it.status = 'ready'; paintPreviews();
        }).catch(function () {
          f.items = f.items.filter(function (x) { return x !== it; }); paintPreviews();
          setErr('media', 'Impossible d\'envoyer « ' + file.name + ' ». Réessayez avec un autre fichier.');
        });
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var title = $('#rvTitle', m).value.trim(), body = $('#rvBody', m).value.trim(), bad = false;
      ['rating', 'body', 'title', 'media'].forEach(function (k) { setErr(k, ''); });
      $('[data-alert]', m).hidden = true;
      if (!f.rating) { setErr('rating', 'Choisissez une note de 1 à 5 étoiles.'); bad = true; }
      if (body.length < 10) { setErr('body', 'Racontez-nous votre expérience (10 caractères minimum).'); bad = true; }
      if (bad) { var first = $('.err:not(:empty)', m); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      var btn = $('[data-submit]', m); btn.disabled = true; btn.classList.add('is-loading');
      var payload = { rating: f.rating, title: title, body: body, media: f.items.filter(function (i) { return i.status === 'ready'; }).map(function (i) { return { url: i.url }; }) };
      api(mine ? 'PUT' : 'POST', mine ? '/reviews/' + mine.id : '/reviews', payload).then(function (r) {
        if (r.status === 201 || r.status === 200) {
          var id = r.data.review.id;
          closeModal(); O.toast(mine ? 'Avis modifié' : 'Merci ! Votre avis est publié.');
          return load().then(function () { var el = document.getElementById('rv-' + id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('is-new'); } });
        }
        btn.classList.remove('is-loading'); btn.disabled = false;
        if (r.status === 401) { closeModal(); Auth.set(null); return loginPrompt(); }
        if (r.status === 409) { closeModal(); return load().then(buildForm); }
        if (r.status === 400 && r.data.fields) { Object.keys(r.data.fields).forEach(function (k) { setErr(k, r.data.fields[k]); }); return; }
        var a = $('[data-alert]', m); a.hidden = false; a.textContent = r.status === 507 ? 'Espace de stockage plein dans ce navigateur (mode démonstration). Retirez une photo.' : 'Une erreur est survenue. Réessayez dans un instant.';
      }).catch(function () {
        btn.classList.remove('is-loading'); btn.disabled = false;
        var a = $('[data-alert]', m); a.hidden = false; a.textContent = 'Connexion impossible. Vérifiez votre réseau puis réessayez.';
      });
    });
    setTimeout(function () { var b = $('.star-pick button', m); if (b) b.focus(); }, 80);
  }

  /* ---------- interactions ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button, a, [data-modal-close]') : null; if (!t) return;
    if (t.matches('[data-write-review]')) { e.preventDefault(); openForm(); return; }
    if (t.matches('[data-modal-close]')) { e.preventDefault(); closeModal(); return; }
    if (t.matches('[data-zoom]')) { e.preventDefault(); zoom(t.getAttribute('data-zoom')); return; }
    if (t.matches('[data-reviews-more]')) { t.disabled = true; load(true); return; }
    if (t.matches('[data-review-edit]')) { openForm(); return; }
    if (t.matches('[data-review-delete]')) {
      if (!window.confirm('Supprimer définitivement votre avis ?')) return;
      api('DELETE', '/reviews/' + state.mine.id).then(function (r) { if (r.status === 200) { O.toast('Avis supprimé'); load(); } });
    }
  });
  document.addEventListener('oreva:auth', function () { if (state.loaded) load(); });

  /* ==========================================================
     BANDEAU "DISPONIBLE CHEZ" (defile) : n'affiche que ce qui est dans config.js
     ========================================================== */
  function initPartners() {
    var host = $('[data-partners]'); if (!host) return;
    var P = CONFIG.partners || {}, items = P.items || [];
    if (!items.length) return;                                     // vide = bandeau cache (rien d'invente)
    var k = Math.max(1, Math.ceil(10 / items.length));
    function one(it) {
      var inner = it.logo ? '<img src="' + esc(it.logo) + '" alt="' + esc(it.name) + '" loading="lazy">' : '<span class="wordmark">' + esc(it.name) + '</span>';
      var safe = /^https?:\/\//.test(it.url || '');
      return '<li>' + (safe ? '<a href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(it.name) + '">' + inner + '</a>' : inner) + '</li>';
    }
    var half = ''; for (var i = 0; i < k; i++) half += items.map(one).join('');
    host.innerHTML = '<p class="partners-title">' + esc(P.title || 'Disponible chez') + '</p>' +
      '<div class="partners-view"><ul class="partners-track">' + half + '</ul><ul class="partners-track" aria-hidden="true">' + half + '</ul></div>';
    host.hidden = false;
  }

  O.Reviews = { load: load, openForm: openForm, state: state };
  initPartners();
  O.ready.then(function () { if ($('[data-reviews]') || $('[data-rating-line]')) load(); });
})();
