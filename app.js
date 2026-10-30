/* ==========================================================
   OREVA - logique partagee (panier, offre, interface)
   Utilise config.js (window.OREVA)
   ========================================================== */
(function () {
  'use strict';

  var OREVA = window.OREVA;
  var CONFIG = OREVA.CONFIG, compute = OREVA.compute, unitPrice = OREVA.unitPrice;
  var P = CONFIG.product, O = CONFIG.offer;

  /* ---------- outils ---------- */
  var fmt = new Intl.NumberFormat(CONFIG.locale, { style: 'currency', currency: CONFIG.currency });
  function money(n) { return fmt.format(n); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function emit(name, detail) { document.dispatchEvent(new CustomEvent('oreva:' + name, { detail: detail })); }
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } }
  };
  function icon(id, cls) {
    return '<svg class="ic ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>';
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var AFF = CONFIG.affiliate;
  function cents(n) { return money((n || 0) / 100); }
  function fmtDate(iso, withTime) {
    var o = withTime ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' };
    return new Intl.DateTimeFormat(CONFIG.locale, o).format(new Date(iso));
  }
  function stars(n, cls) {
    var s = ''; for (var i = 0; i < 5; i++) s += icon('star', i < Math.round(n) ? 'on' : 'off');
    return '<span class="stars ' + (cls || '') + '" aria-hidden="true">' + s + '</span>';
  }
  /* photo de profil ronde (ou initiales si absente) */
  function avatarHtml(u, size, cls) {
    size = size || 40;
    if (u && u.avatar) return '<img class="av ' + (cls || '') + '" src="' + esc(u.avatar) + '" alt="" width="' + size + '" height="' + size + '">';
    var ini = ((u && u.firstName ? u.firstName.charAt(0) : '?') + (u && u.lastName ? u.lastName.charAt(0) : '')).toUpperCase();
    return '<span class="av av-ini ' + (cls || '') + '" style="width:' + size + 'px;height:' + size + 'px">' + esc(ini) + '</span>';
  }

  /* ---------- icones (sprite injecte, fonctionne meme en double-clic sur le fichier) ---------- */
  var SPRITE = '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>' +
    '<symbol id="i-bag" viewBox="0 0 24 24"><path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/></symbol>' +
    '<symbol id="i-truck" viewBox="0 0 24 24"><path d="M2.5 6.5h11v9.5h-11z"/><path d="M13.5 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/></symbol>' +
    '<symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></symbol>' +
    '<symbol id="i-return" viewBox="0 0 24 24"><path d="M4 9.5h10.5a5 5 0 0 1 0 10H8"/><path d="M8 5.5l-4 4 4 4"/></symbol>' +
    '<symbol id="i-chat" viewBox="0 0 24 24"><path d="M4 5h16v11H9.5L4 20.5z"/></symbol>' +
    '<symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"/></symbol>' +
    '<symbol id="i-drop" viewBox="0 0 24 24"><path d="M12 3c4 4.8 6.5 8 6.5 11.2a6.5 6.5 0 0 1-13 0C5.5 11 8 7.800 12 3z"/></symbol>' +
    '<symbol id="i-spark" viewBox="0 0 24 24"><path d="M11 3l1.9 5.4L18.500 10.500l-5.600 2.100L11 18l-1.900-5.400L3.500 10.500l5.600-2.100z"/><path d="M19 16l.8 2.200L22 19l-2.200.8L19 22l-.8-2.200L16 19l2.200-.8z"/></symbol>' +
    '<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.800-3.400 7.800-8 9-4.600-1.200-8-4.200-8-9V6z"/><path d="M8.500 12l2.500 2.500 4.500-5"/></symbol>' +
    '<symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.500l4.500 4.500L19 7.500"/></symbol>' +
    '<symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>' +
    '<symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>' +
    '<symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>' +
    '<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>' +
    '<symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol>' +
    '<symbol id="i-layers" viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.500l9 5 9-5"/></symbol>' +
    '<symbol id="i-flask" viewBox="0 0 24 24"><path d="M9 3h6M10 3v6L4.800 18.500A2 2 0 0 0 6.600 21.500h10.800a2 2 0 0 0 1.800-3L14 9V3"/><path d="M7.500 15h9"/></symbol>' +
    '<symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20s-7.500-4.500-7.500-10.200A4.300 4.300 0 0 1 12 7.300a4.300 4.300 0 0 1 7.500 2.500C19.500 15.500 12 20 12 20z"/></symbol>' +
    '<symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3.500l2.600 5.400 5.900.8-4.300 4.100 1 5.800L12 16.800l-5.200 2.800 1-5.800L3.500 9.700l5.900-.8z" fill="currentColor"/></symbol>' +
    '<symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 2.500L5 13.500h6l-1 8 8-11h-6z"/></symbol>' +
    '<symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20.500c0-4 3.600-6.500 8-6.500s8 2.500 8 6.500"/></symbol>' +
    '<symbol id="i-camera" viewBox="0 0 24 24"><path d="M4 8h3l1.500-2.500h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.500"/></symbol>' +
    '<symbol id="i-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.500A1.500 1.500 0 0 0 14.500 4h-9A1.500 1.500 0 0 0 4 5.500v9A1.500 1.500 0 0 0 5.500 16H8"/></symbol>' +
    '<symbol id="i-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.500 0l3-3a4 4 0 0 0-5.600-5.600l-1 1"/><path d="M14 10a4 4 0 0 0-5.500 0l-3 3a4 4 0 0 0 5.600 5.600l1-1"/></symbol>' +
    '<symbol id="i-wallet" viewBox="0 0 24 24"><path d="M4 7.500A2.500 2.500 0 0 1 6.500 5H18v3"/><path d="M4 7.500V18a1.500 1.500 0 0 0 1.500 1.500H19a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H6.500A2.500 2.500 0 0 1 4 7.500z"/><circle cx="16" cy="13.500" r="1.200"/></symbol>' +
    '<symbol id="i-box" viewBox="0 0 24 24"><path d="M3.500 7.500L12 3l8.500 4.500v9L12 21l-8.500-4.500z"/><path d="M3.500 7.500L12 12l8.500-4.500M12 12v9"/></symbol>' +
    '<symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5.500v13l11-6.500z"/></symbol>' +
    '<symbol id="i-image" viewBox="0 0 24 24"><rect x="3.500" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.600"/><path d="M4 17l5-4.500 3.500 3 3-2.500 4.500 4"/></symbol>' +
    '<symbol id="i-trash" viewBox="0 0 24 24"><path d="M5 7h14M10 7V4.500h4V7M7 7l.8 12.500h8.400L17 7"/></symbol>' +
    '<symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20l1-4L16.500 4.500a2 2 0 0 1 3 3L8 19z"/></symbol>' +
    '<symbol id="i-logout" viewBox="0 0 24 24"><path d="M10 4.500H6A1.500 1.500 0 0 0 4.500 6v12A1.500 1.500 0 0 0 6 19.500h4"/><path d="M15 8l4 4-4 4M19 12H9.500"/></symbol>' +
    '<symbol id="i-share" viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.500"/><circle cx="17.500" cy="6" r="2.500"/><circle cx="17.500" cy="18" r="2.500"/><path d="M8.200 10.800l7-3.600M8.200 13.200l7 3.600"/></symbol>' +
    '<symbol id="i-eye" viewBox="0 0 24 24"><path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><circle cx="12" cy="12" r="3"/></symbol>' +
    '<symbol id="i-chart" viewBox="0 0 24 24"><path d="M3.500 17l6-6 4 4 7-8"/><path d="M15 7h5.500v5.500"/></symbol>' +
    '<symbol id="i-mail" viewBox="0 0 24 24"><rect x="3.500" y="5.500" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/></symbol>' +
    '</defs></svg>';
  document.body.insertAdjacentHTML('afterbegin', SPRITE);

  /* ==========================================================
     API : serveur reel (node server.js)  OU  mode demonstration
     (sans serveur, tout reste dans le navigateur : localStorage)
     ========================================================== */
  var MODE = 'demo';
  var DB_KEY = 'oreva_demo_db_v2', SID_KEY = 'oreva_demo_sid';
  var demoCoreInst = null, demoQueue = Promise.resolve();

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function randHex(n) {
    var a = new Uint8Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
    return hex(a);
  }
  function fnv(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
  var hasSubtle = !!(window.crypto && window.crypto.subtle);
  function sha256(str) {
    if (!hasSubtle) return Promise.resolve(fnv(str) + fnv(str + 'x'));
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(hex);
  }
  function pbkdf2(pw, salt) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, k, 256);
    }).then(hex);
  }
  var demoCrypto = {
    randomToken: function () { return Promise.resolve(randHex(32)); },
    randomId: function () { return Promise.resolve(randHex(8)); },
    sha256: sha256,
    hashPassword: function (pw) {
      var salt = randHex(16);
      return (hasSubtle ? pbkdf2(pw, salt) : Promise.resolve(fnv(salt + pw))).then(function (h) { return 'pbkdf2$' + salt + '$' + h; });
    },
    verifyPassword: function (pw, stored) {
      var p = String(stored).split('$');
      return (hasSubtle ? pbkdf2(pw, p[1]) : Promise.resolve(fnv(p[1] + pw))).then(function (h) { return h === p[2]; });
    }
  };
  var DATA_IMG = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
  var demoMedia = {
    videoSupported: false,
    saveAvatar: function (d) {
      if (typeof d !== 'string' || d.length > 560000 || !DATA_IMG.test(d)) return Promise.reject(new Error('bad_image'));
      return Promise.resolve(d);
    },
    checkAttachment: function (db, uid, it) {
      if (it && typeof it.url === 'string' && it.url.length <= 560000 && DATA_IMG.test(it.url)) return { type: 'image', url: it.url };
      return null;
    }
  };

  function demoCall(method, path, body) {
    var run = demoQueue.then(function () {
      if (!demoCoreInst) demoCoreInst = window.OrevaCore.create({ CONFIG: CONFIG, compute: compute, crypto: demoCrypto, media: demoMedia });
      var core = demoCoreInst, db = null;
      try { db = JSON.parse(store.get(DB_KEY) || 'null'); } catch (e) { db = null; }
      db = core.fix(db || core.emptyDb());
      var q = {}, i = path.indexOf('?');
      if (i >= 0) {
        path.slice(i + 1).split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
        path = path.slice(0, i);
      }
      return core.handle(db, { method: method, path: path, query: q, body: body || {}, sid: store.get(SID_KEY) || null, admin: path.indexOf('/admin/') === 0, ip: 'local' })
        .then(function (out) {
          if (out.dirty) {
            try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { return { status: 507, data: { error: 'storage_full' } }; }
          }
          if (out.session) {
            if (out.session.clear) { try { localStorage.removeItem(SID_KEY); } catch (e) { /* rien */ } } else store.set(SID_KEY, out.session.set);
          }
          return { status: out.status, data: out.body };
        });
    });
    demoQueue = run.catch(function () {});
    return run;
  }

  function serverCall(method, path, body) {
    var headers = { 'X-Requested-With': 'oreva' };
    if (OREVA.adminKey) headers['X-Admin-Key'] = OREVA.adminKey;
    var o = { method: method, headers: headers, credentials: 'same-origin', cache: 'no-store' };
    if (method !== 'GET' && body !== undefined) { headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch('api' + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, data: d }; });
    });
  }

  /* detecte si un vrai serveur repond (sinon : mode demonstration) */
  var readyP = new Promise(function (resolve) {
    if (typeof fetch !== 'function' || location.protocol === 'file:' || !window.OrevaCore) { MODE = 'demo'; return resolve(); }
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 2500);
    fetch('api/offer', { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error('no api'); return r.json(); })
      .then(function (d) { if (typeof d.used !== 'number') throw new Error('bad api'); MODE = 'server'; })
      .catch(function () { clearTimeout(t); MODE = 'demo'; })
      .then(resolve);
  });

  function api(method, path, body) {
    return readyP.then(function () { return MODE === 'server' ? serverCall(method, path, body) : demoCall(method, path, body); });
  }

  /* televersement d'un fichier d'avis (photo redimensionnee ou video) : serveur uniquement */
  function uploadFile(blob) {
    return fetch('api/upload', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'oreva' }, body: blob })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, data: d }; }); });
  }

  /* ---------- images : recadrage / redimensionnement dans le navigateur ---------- */
  function loadImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () { URL.revokeObjectURL(url); res(im); };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('bad_image')); };
      im.src = url;
    });
  }
  function fileToJpeg(file, max, quality, square) {
    return loadImage(file).then(function (im) {
      var w = im.naturalWidth, h = im.naturalHeight, sx = 0, sy = 0, sw = w, sh = h;
      if (square) { var m = Math.min(w, h); sx = (w - m) / 2; sy = (h - m) / 2; sw = sh = m; }
      var k = Math.min(1, max / Math.max(sw, sh)), cw = Math.max(1, Math.round(sw * k)), ch = Math.max(1, Math.round(sh * k));
      var c = document.createElement('canvas'); c.width = cw; c.height = ch;
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.drawImage(im, sx, sy, sw, sh, 0, 0, cw, ch);
      return c.toDataURL('image/jpeg', quality);
    });
  }
  function dataUrlToBlob(d) {
    var p = d.split(','), mime = /:(.*?);/.exec(p[0])[1], bin = atob(p[1]), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: mime });
  }

  /* ==========================================================
     COMPTE CLIENT (etat de connexion partage par toutes les pages)
     ========================================================== */
  var Auth = {
    user: null, loaded: false,
    refresh: function () {
      return api('GET', '/auth/me').then(function (r) { Auth.user = (r.data && r.data.user) || null; })
        .catch(function () { Auth.user = null; })
        .then(function () { Auth.loaded = true; emit('auth'); return Auth.user; });
    },
    set: function (u) { Auth.user = u; Auth.loaded = true; emit('auth'); },
    logout: function () { return api('POST', '/auth/logout', {}).then(function () { Auth.set(null); }); }
  };

  /* ---------- parrainage : on retient le code ?ref= pendant 30 jours ---------- */
  var Ref = {
    KEY: 'oreva_ref_v1',
    get: function () {
      try { var r = JSON.parse(store.get(this.KEY) || 'null'); if (r && r.code && Date.now() - r.at < AFF.cookieDays * 864e5) return r.code; } catch (e) { /* rien */ }
      return null;
    },
    set: function (code) { store.set(this.KEY, JSON.stringify({ code: code, at: Date.now() })); },
    clear: function () { try { localStorage.removeItem(this.KEY); } catch (e) { /* rien */ } }
  };
  function captureRef() {
    var m = /[?&]ref=([A-Za-z0-9]{4,12})/.exec(location.search); if (!m) return;
    var code = m[1].toUpperCase();
    api('GET', '/affiliate/check?code=' + code).then(function (r) {
      if (!(r.data && r.data.valid)) return;
      Ref.set(code);
      var k = 'oreva_ref_click_' + code, last = parseInt(store.get(k), 10) || 0;
      if (Date.now() - last > 12 * 3600e3) { store.set(k, String(Date.now())); api('POST', '/affiliate/click', { code: code }); }
      emit('ref');
    });
    try { var u = new URL(location.href); u.searchParams.delete('ref'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) { /* rien */ }
  }

  /* ---------- suivi de commande (frise + numero de suivi) ---------- */
  var STATUS = { received: 'Commande reçue', preparing: 'En préparation', shipped: 'Expédiée', delivered: 'Livrée', cancelled: 'Annulée' };
  var FLOW = ['received', 'preparing', 'shipped', 'delivered'];
  function addBusiness(d, n) { var x = new Date(d); while (n > 0) { x.setDate(x.getDate() + 1); var w = x.getDay(); if (w !== 0 && w !== 6) n--; } return x; }
  function estimateText(iso) {
    var f = new Intl.DateTimeFormat(CONFIG.locale, { weekday: 'short', day: 'numeric', month: 'short' });
    return f.format(addBusiness(iso, CONFIG.shipping.minDays)) + ' – ' + f.format(addBusiness(iso, CONFIG.shipping.maxDays));
  }
  function trackingHtml(o) {
    var cancelled = o.status === 'cancelled', idx = FLOW.indexOf(o.status), at = {};
    o.history.forEach(function (h) { at[h.status] = h.at; });
    var html = '<ol class="track' + (cancelled ? ' is-cancelled' : '') + '">' + FLOW.map(function (s, i) {
      var done = !cancelled && i <= idx, cur = !cancelled && i === idx;
      return '<li class="' + (done ? 'done ' : '') + (cur ? 'current' : '') + '"><span class="dot">' + (done ? icon('check') : '') + '</span><b>' + STATUS[s] + '</b><small>' + (at[s] ? esc(fmtDate(at[s], true)) : '') + '</small></li>';
    }).join('') + '</ol>';
    if (cancelled) html += '<p class="track-note is-bad">' + icon('close') + ' Commande annulée le ' + esc(fmtDate(at.cancelled, true)) + '. Aucun montant n\'est dû.</p>';
    else if (o.status === 'delivered') html += '<p class="track-note is-ok">' + icon('check') + ' Livrée le ' + esc(fmtDate(at.delivered)) + '. Nous espérons que vous l\'adorez !</p>';
    else html += '<p class="track-note">' + icon('truck') + ' Livraison estimée : <b>' + esc(estimateText(o.createdAt)) + '</b></p>';
    if (o.tracking) html += '<p class="track-num">' + icon('box') + ' <span>' + esc(o.tracking.carrier) + ' · N° de suivi <code>' + esc(o.tracking.number) + '</code></span>' +
      '<button class="link-btn" type="button" data-copy="' + esc(o.tracking.number) + '">Copier</button></p>';
    html += '<details class="track-log"><summary>Historique détaillé</summary><ul>' + o.history.slice().reverse().map(function (h) {
      return '<li><b>' + esc(STATUS[h.status] || h.status) + '</b> <span>' + esc(fmtDate(h.at, true)) + '</span>' + (h.note ? '<em>' + esc(h.note) + '</em>' : '') + '</li>';
    }).join('') + '</ul></details>';
    return html;
  }
  function copyText(text) {
    var done = function () { toast('Copié dans le presse-papiers'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() {
      var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { /* rien */ } t.remove();
    }
  }

  /* ==========================================================
     PANIER (une seule reference produit : on stocke la quantite)
     ========================================================== */
  var Cart = {
    key: 'oreva_cart_v1',
    qty: function () {
      var n = parseInt(store.get(this.key), 10);
      return n > 0 ? Math.min(n, P.maxQty) : 0;
    },
    set: function (n) {
      n = Math.max(0, Math.min(P.maxQty, Math.floor(n) || 0));
      store.set(this.key, String(n));
      emit('cart');
    },
    add: function (n) { this.set(this.qty() + (n || 1)); },
    clear: function () { this.set(0); }
  };

  /* ==========================================================
     OFFRE -15 % / 50 PREMIERS CLIENTS
     - avec le serveur (node server.js) : le compteur est reel et impossible a contourner
     - sans serveur (double-clic / hebergement statique) : mode demo, compteur local au navigateur
       (meme code que le serveur : voir core.js)
     ========================================================== */
  var Offer = {
    limit: O.limit, used: 0, loaded: false,
    get mode() { return MODE; },
    get remaining() { return Math.max(0, this.limit - this.used); },
    get active() { return this.remaining > 0; },
    refresh: function () {
      var self = this;
      return api('GET', '/offer').then(function (r) {
        if (r.status === 200 && typeof r.data.used === 'number') { self.limit = r.data.limit; self.used = r.data.used; }
      }).catch(function () { /* on garde les derniers chiffres connus */ })
        .then(function () { self.loaded = true; emit('offer'); return self; });
    }
  };

  function offerOn() { return Offer.active && !OREVA.offerDenied; }

  /* ---------- liaison de l'interface avec l'etat de l'offre ---------- */
  function renderOffer() {
    var on = Offer.active;
    $$('[data-offer-remaining]').forEach(function (e) { e.textContent = Offer.remaining; });
    $$('[data-offer-limit]').forEach(function (e) { e.textContent = Offer.limit; });
    $$('[data-offer-used]').forEach(function (e) { e.textContent = Offer.used; });
    $$('[data-offer-bar]').forEach(function (e) { e.style.width = Math.min(100, (Offer.used / Offer.limit) * 100) + '%'; });
    $$('.js-offer-on').forEach(function (e) { e.hidden = !on; });
    $$('.js-offer-off').forEach(function (e) { e.hidden = on; });
    document.documentElement.classList.toggle('offer-ended', !on);
    document.documentElement.classList.toggle('offer-low', on && Offer.remaining <= 10);

    var now = unitPrice(on);
    $$('[data-price-now]').forEach(function (e) { e.textContent = money(now); });
    $$('[data-price-was]').forEach(function (e) { e.textContent = money(P.price); });
    $$('[data-price-save]').forEach(function (e) { e.textContent = money(OREVA.round2(P.price - now)); });
    $$('[data-price-base]').forEach(function (e) { e.textContent = money(P.price); });
    renderDrawer();
  }

  /* ==========================================================
     TIROIR PANIER
     ========================================================== */
  var drawer = null, lastFocus = null;

  function mountDrawer() {
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="drawer-overlay" data-close-cart></div>' +
      '<aside class="drawer" role="dialog" aria-modal="true" aria-label="Panier" aria-hidden="true" tabindex="-1">' +
      '<header class="drawer-head"><h2>Votre panier <span class="drawer-count"></span></h2>' +
      '<button class="icon-btn" type="button" data-close-cart aria-label="Fermer le panier">' + icon('close') + '</button></header>' +
      '<div class="drawer-body"></div><footer class="drawer-foot"></footer></aside>' +
      '<div class="toast-wrap" role="status" aria-live="polite"></div>';
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
    drawer = {
      overlay: $('.drawer-overlay'), el: $('.drawer'),
      body: $('.drawer-body'), foot: $('.drawer-foot'), count: $('.drawer-count')
    };
  }

  function openDrawer() {
    if (!drawer) return;
    lastFocus = document.activeElement;
    renderDrawer();
    drawer.el.classList.add('is-open'); drawer.overlay.classList.add('is-open');
    drawer.el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    setTimeout(function () { var b = $('[data-close-cart]', drawer.el); if (b) b.focus(); }, 60);
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.el.classList.remove('is-open'); drawer.overlay.classList.remove('is-open');
    drawer.el.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function renderDrawer() {
    if (!drawer) return;
    var qty = Cart.qty();
    drawer.count.textContent = qty ? '(' + qty + ')' : '';
    if (!qty) {
      drawer.body.innerHTML =
        '<div class="drawer-empty">' + icon('bag', 'ic-xl') +
        '<h3>Votre panier est vide</h3><p>Découvrez le soin et profitez de l\'offre de lancement.</p>' +
        '<a class="btn btn-primary" href="' + (document.body.dataset.home || 'index.html') + '#produit" data-close-cart>Voir le produit ' + icon('arrow') + '</a></div>';
      drawer.foot.innerHTML = '';
      return;
    }
    var c = compute(qty, offerOn());
    var toFree = Math.max(0, OREVA.round2(CONFIG.shipping.freeOver - c.subtotal));
    var pct = Math.min(100, (c.subtotal / CONFIG.shipping.freeOver) * 100);
    var meter = c.freeShipping
      ? '<p class="meter-ok">' + icon('check') + ' Livraison offerte sur cette commande</p>'
      : '<p>Plus que <strong>' + money(toFree) + '</strong> pour la livraison offerte <span class="muted">(2 pots suffisent)</span></p>';
    var unitNow = unitPrice(offerOn());
    drawer.body.innerHTML =
      '<div class="ship-meter">' + meter + '<div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
      '<ul class="lines"><li class="line">' +
      '<div class="line-img"><img src="' + P.image + '" alt=""></div>' +
      '<div class="line-info"><strong>' + esc(P.name) + '</strong><span class="muted">' + esc(P.brand) + ' · ' + esc(P.size) + '</span>' +
      '<div class="stepper stepper-sm" role="group" aria-label="Quantité">' +
      '<button type="button" data-cart-dec aria-label="Retirer un">' + icon('minus') + '</button><output>' + qty + '</output>' +
      '<button type="button" data-cart-inc aria-label="Ajouter un"' + (qty >= P.maxQty ? ' disabled' : '') + '>' + icon('plus') + '</button></div>' +
      '<button class="link-btn" type="button" data-cart-remove>Retirer</button></div>' +
      '<div class="line-price">' + (offerOn() ? '<s>' + money(P.price * qty) + '</s>' : '') + '<b>' + money(unitNow * qty) + '</b></div>' +
      '</li></ul>';
    drawer.foot.innerHTML =
      '<dl class="totals">' +
      '<div><dt>Sous-total</dt><dd>' + money(c.subtotal) + '</dd></div>' +
      (c.discount ? '<div class="t-offer"><dt>Offre de lancement (−' + O.percent + '&nbsp;%)</dt><dd>−' + money(c.discount) + '</dd></div>' : '') +
      '<div><dt>Livraison</dt><dd>' + (c.freeShipping ? 'Offerte' : money(c.shipping)) + '</dd></div>' +
      '<div class="t-total"><dt>Total</dt><dd>' + money(c.total) + '</dd></div></dl>' +
      '<a class="btn btn-primary btn-block btn-lg" href="' + (document.body.dataset.checkout || 'checkout.html') + '">Passer à la caisse ' + icon('arrow') + '</a>' +
      '<p class="foot-note">' + icon('lock') + ' Paiement sécurisé · Retours sous ' + CONFIG.returns.days + ' jours</p>';
  }


  /* ==========================================================
     EN-TETE ET PIED DE PAGE (un seul modele pour toutes les pages)
     ========================================================== */
  var NAV = [['Le soin', 'index.html#produit'], ['Pourquoi', 'index.html#pourquoi'], ['Utilisation', 'index.html#utilisation'],
    ['Avis', 'index.html#avis'], ['FAQ', 'index.html#faq'], ['Affiliation', 'affiliation.html']];

  function mountHeader() {
    var h = $('[data-header]'); if (!h) return;
    var page = document.body.dataset.page || '';
    h.innerHTML =
      '<div class="header-inner">' +
      '<button class="icon-btn nav-toggle" type="button" data-nav-toggle aria-label="Ouvrir le menu" aria-expanded="false">' + icon('menu') + '</button>' +
      '<a class="logo" href="index.html" aria-label="Oreva, accueil">Oreva<i aria-hidden="true"></i><small>soins de la peau</small></a>' +
      '<nav class="main-nav" aria-label="Navigation principale">' +
      NAV.map(function (n) { return '<a href="' + n[1] + '"' + (page && n[1].indexOf(page) === 0 ? ' aria-current="page"' : '') + '>' + n[0] + '</a>'; }).join('') +
      '<a class="nav-extra" href="compte.html">Mon compte</a><a class="nav-extra" href="suivi.html">Suivre ma commande</a></nav>' +
      '<div class="header-actions">' +
      '<a class="acct-btn" href="compte.html" data-acct aria-label="Mon compte">' + icon('user') + '<span class="acct-label">Connexion</span></a>' +
      '<button class="cart-btn" type="button" data-open-cart aria-label="Ouvrir le panier">' + icon('bag') + '<span class="cart-label">Panier</span><span class="cart-count" data-cart-count hidden>0</span></button>' +
      '</div></div>';
  }

  function renderAuth() {
    var u = Auth.user;
    $$('[data-acct]').forEach(function (a) {
      if (u) {
        a.setAttribute('aria-label', 'Mon compte (' + u.firstName + ')');
        a.classList.add('is-in');
        a.innerHTML = avatarHtml(u, 30) + '<span class="acct-label">' + esc(u.firstName) + '</span>';
      } else {
        a.setAttribute('aria-label', 'Connexion ou création de compte');
        a.classList.remove('is-in');
        a.innerHTML = icon('user') + '<span class="acct-label">Connexion</span>';
      }
    });
    $$('[data-auth-in]').forEach(function (e) { e.hidden = !u; });
    $$('[data-auth-out]').forEach(function (e) { e.hidden = !!u; });
  }

  function mountFooter() {
    var f = $('[data-footer]'); if (!f) return;
    f.className = 'site-footer';
    f.innerHTML =
      '<div class="footer-inner">' +
      '<div class="f-brand"><a class="logo" href="index.html">Oreva<i aria-hidden="true"></i></a>' +
      '<p>Boutique en ligne de soins pour la peau. Des produits choisis avec soin, livrés chez vous.</p></div>' +
      '<nav aria-label="Boutique"><h4>Boutique</h4><ul><li><a href="index.html#produit">Le soin</a></li><li><a href="index.html#pourquoi">La formule</a></li><li><a href="index.html#utilisation">Utilisation</a></li><li><a href="index.html#avis">Avis clients</a></li></ul></nav>' +
      '<nav aria-label="Mon compte"><h4>Mon compte</h4><ul><li><a href="compte.html">Connexion / Inscription</a></li><li><a href="compte.html#commandes">Mes commandes</a></li><li><a href="suivi.html">Suivre ma commande</a></li><li><a href="affiliation.html">Programme d\'affiliation</a></li></ul></nav>' +
      '<nav aria-label="Aide"><h4>Aide</h4><ul><li><a href="index.html#faq">FAQ</a></li><li><a href="infos.html#livraison">Livraison</a></li><li><a href="infos.html#retours">Retours</a></li><li><a href="infos.html#contact">Nous joindre</a></li></ul></nav>' +
      '<nav aria-label="Légal"><h4>Légal</h4><ul><li><a href="infos.html#cgv">Conditions de vente</a></li><li><a href="infos.html#confidentialite">Confidentialité</a></li><li><a href="infos.html#affiliation-conditions">Conditions d\'affiliation</a></li></ul></nav>' +
      '</div>' +
      '<div class="footer-bottom"><p>&copy; ' + new Date().getFullYear() + ' ' + esc(CONFIG.shop.name) + '. Tous droits réservés.</p>' +
      '<p>' + esc(CONFIG.shop.name) + ' est une boutique indépendante, non affiliée à la marque Neutrogena. Les marques citées appartiennent à leurs propriétaires respectifs. Les produits cosmétiques ne sont pas destinés à diagnostiquer, traiter ou guérir une affection.</p></div>';
  }

  /* ---------- notifications ---------- */
  function toast(msg) {
    var wrap = $('.toast-wrap'); if (!wrap) return;
    var t = document.createElement('div');
    t.className = 'toast'; t.innerHTML = icon('check') + '<span>' + esc(msg) + '</span>';
    wrap.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('in'); });
    setTimeout(function () { t.classList.remove('in'); setTimeout(function () { t.remove(); }, 300); }, 2600);
  }

  /* ==========================================================
     INTERACTIONS GENERALES (delegation d'evenements)
     ========================================================== */
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button, a, [data-close-cart]') : null;
    if (!t) return;

    if (t.matches('[data-copy]')) { e.preventDefault(); copyText(t.getAttribute('data-copy')); return; }
    if (t.matches('[data-logout]')) { e.preventDefault(); Auth.logout().then(function () { toast('Vous êtes déconnecté(e)'); }); return; }
    if (t.matches('[data-open-cart]')) { e.preventDefault(); openDrawer(); return; }
    if (t.matches('[data-close-cart]')) { if (t.tagName !== 'A') e.preventDefault(); closeDrawer(); return; }

    if (t.matches('[data-add]')) {
      e.preventDefault();
      var q = $('#qty'); var n = q ? Math.max(1, parseInt(q.value, 10) || 1) : 1;
      var before = Cart.qty(); Cart.add(n);
      if (before + n > P.maxQty) toast('Maximum ' + P.maxQty + ' par commande');
      openDrawer(); return;
    }
    if (t.matches('[data-buy-now]')) {
      e.preventDefault();
      var q2 = $('#qty'); var n2 = q2 ? Math.max(1, parseInt(q2.value, 10) || 1) : 1;
      Cart.set(n2); location.href = t.getAttribute('href') || 'checkout.html'; return;
    }
    if (t.matches('[data-cart-inc]')) { Cart.set(Cart.qty() + 1); return; }
    if (t.matches('[data-cart-dec]')) { Cart.set(Cart.qty() - 1); return; }
    if (t.matches('[data-cart-remove]')) { Cart.clear(); return; }

    if (t.matches('[data-qty-minus],[data-qty-plus]')) {
      var input = $('#qty'); if (!input) return;
      var v = parseInt(input.value, 10) || 1;
      v += t.matches('[data-qty-plus]') ? 1 : -1;
      input.value = Math.max(1, Math.min(P.maxQty, v));
      input.dispatchEvent(new Event('input', { bubbles: true })); return;
    }
    if (t.matches('[data-nav-toggle]')) {
      var h = $('.site-header'); var open = h.classList.toggle('nav-open');
      t.setAttribute('aria-expanded', open ? 'true' : 'false'); return;
    }
    if (t.closest('.main-nav') && t.tagName === 'A') { var hh = $('.site-header'); if (hh) hh.classList.remove('nav-open'); }
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

  var qtyInput = $('#qty');
  if (qtyInput) qtyInput.addEventListener('change', function () {
    var v = parseInt(qtyInput.value, 10) || 1; qtyInput.value = Math.max(1, Math.min(P.maxQty, v));
  });

  /* ---------- compteur d'articles du panier ---------- */
  function renderCart() {
    var n = Cart.qty();
    $$('[data-cart-count]').forEach(function (e) { e.textContent = n; e.hidden = n === 0; });
    renderDrawer();
  }
  document.addEventListener('oreva:cart', renderCart);
  document.addEventListener('oreva:offer', renderOffer);
  window.addEventListener('storage', function () { renderCart(); Offer.refresh(); if (Auth.loaded) Auth.refresh(); });

  /* ==========================================================
     PAGE D'ACCUEIL : galerie, accordeons, reveal, barre d'achat mobile...
     ========================================================== */
  function initGallery() {
    var g = $('[data-gallery]'); if (!g) return;
    var slides = $$('.slide', g), thumbs = $$('.thumb', g), cur = 0;
    function go(i) {
      cur = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('is-active', k === cur); });
      thumbs.forEach(function (t, k) { t.classList.toggle('is-active', k === cur); t.setAttribute('aria-selected', k === cur ? 'true' : 'false'); });
    }
    thumbs.forEach(function (t, i) { t.addEventListener('click', function () { go(i); }); });
    var prev = $('[data-gal-prev]', g), next = $('[data-gal-next]', g);
    if (prev) prev.addEventListener('click', function () { go(cur - 1); });
    if (next) next.addEventListener('click', function () { go(cur + 1); });
    g.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') go(cur - 1); if (e.key === 'ArrowRight') go(cur + 1);
    });
    var stage = $('.stage', g);
    if (stage && window.matchMedia('(hover: hover)').matches) {
      stage.addEventListener('mousemove', function (e) {
        var r = stage.getBoundingClientRect();
        stage.style.setProperty('--zx', ((e.clientX - r.left) / r.width * 100) + '%');
        stage.style.setProperty('--zy', ((e.clientY - r.top) / r.height * 100) + '%');
      });
    }
    // glissement tactile
    var sx = null;
    if (!stage) return;
    stage.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (sx === null) return; var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1)); sx = null;
    });
  }

  function initAccordions() {
    $$('details[data-acc]').forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (!d.open) return;
        $$('details[data-acc="' + d.dataset.acc + '"]').forEach(function (o) { if (o !== d) o.open = false; });
      });
    });
  }

  function initDelivery() {
    var el = $$('[data-delivery]'); if (!el.length) return;
    function addBusiness(d, n) {
      var x = new Date(d); while (n > 0) { x.setDate(x.getDate() + 1); var w = x.getDay(); if (w !== 0 && w !== 6) n--; } return x;
    }
    var now = new Date();
    var a = addBusiness(now, CONFIG.shipping.minDays), b = addBusiness(now, CONFIG.shipping.maxDays);
    var f = new Intl.DateTimeFormat(CONFIG.locale, { weekday: 'short', day: 'numeric', month: 'short' });
    el.forEach(function (e) { e.textContent = f.format(a) + ' – ' + f.format(b); });
  }

  function initReveal() {
    var items = $$('[data-reveal]');
    if (!items.length || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach(function (i) { i.classList.add('in'); }); return;
    }
    document.documentElement.classList.add('js-reveal');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (i) { io.observe(i); });
    setTimeout(function () { items.forEach(function (i) { i.classList.add('in'); }); }, 6000);   // filet de securite
  }

  function initStickyBuy() {
    var bar = $('.sticky-buy'), box = $('[data-buybox]'); if (!bar || !box || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (en) {
      var gone = !en[0].isIntersecting && en[0].boundingClientRect.top < 0;
      bar.classList.toggle('is-visible', gone);
    }).observe(box);
  }

  /* ---------- infolettre ---------- */
  function initNewsletter() {
    $$('[data-newsletter]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = $('input[type=email]', form), msg = $('.form-msg', form.parentNode) || $('.form-msg');
        var email = (input.value || '').trim();
        var ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
        var show = function (text, good) { if (!msg) return; msg.textContent = text; msg.className = 'form-msg ' + (good ? 'ok' : 'bad'); };
        if (!ok) { input.setAttribute('aria-invalid', 'true'); show('Entrez une adresse courriel valide.', false); return; }
        input.removeAttribute('aria-invalid');
        var btn = $('button', form); btn.disabled = true;
        api('POST', '/subscribe', { email: email }).then(function (r) {
          if (r.status !== 200) throw new Error();
          show('Merci ! Vous êtes inscrit(e).', true); form.reset(); btn.disabled = false;
        }).catch(function () { show('Une erreur est survenue. Réessayez dans un instant.', false); btn.disabled = false; });
      });
    });
  }

  /* ---------- contact (page infos) : ouvre le courriel du client ---------- */
  function initContact() {
    var f = $('[data-contact]'); if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = new FormData(f);
      var subject = encodeURIComponent('Message depuis ' + CONFIG.shop.name + ' - ' + (d.get('sujet') || ''));
      var body = encodeURIComponent((d.get('message') || '') + '\n\n' + (d.get('nom') || '') + '\n' + (d.get('email') || ''));
      location.href = 'mailto:' + CONFIG.shop.email + '?subject=' + subject + '&body=' + body;
    });
  }

  /* ---------- petits textes dynamiques (config) ---------- */
  function initText() {
    var map = {
      '[data-shop-name]': CONFIG.shop.name, '[data-shop-email]': CONFIG.shop.email,
      '[data-return-days]': CONFIG.returns.days, '[data-free-over]': money(CONFIG.shipping.freeOver),
      '[data-flat-rate]': money(CONFIG.shipping.flatRate), '[data-ship-min]': CONFIG.shipping.minDays,
      '[data-ship-max]': CONFIG.shipping.maxDays, '[data-offer-percent]': O.percent,
      '[data-product-size]': P.size, '[data-currency]': CONFIG.currency, '[data-year]': new Date().getFullYear(),
      '[data-aff-percent]': AFF.percent, '[data-aff-days]': AFF.cookieDays, '[data-aff-min]': money(AFF.minWithdraw)
    };
    Object.keys(map).forEach(function (sel) { $$(sel).forEach(function (e) { e.textContent = map[sel]; }); });
    $$('a[data-mailto]').forEach(function (a) { a.href = 'mailto:' + CONFIG.shop.email; a.textContent = CONFIG.shop.email; });
  }

  /* ---------- demarrage ---------- */
  mountHeader(); mountFooter(); mountDrawer();
  initText(); initGallery(); initAccordions(); initDelivery(); initReveal(); initStickyBuy(); initNewsletter(); initContact();
  renderCart(); renderOffer(); renderAuth();
  document.addEventListener('oreva:auth', renderAuth);
  readyP.then(function () {
    captureRef(); Auth.refresh(); Offer.refresh(); emit('ready');
  });
  setInterval(function () { if (!document.hidden && MODE === 'server') Offer.refresh(); }, 30000);

  /* acces pour les autres scripts (checkout.js, account.js, reviews.js...) */
  OREVA.Cart = Cart; OREVA.Offer = Offer; OREVA.money = money; OREVA.offerOn = offerOn;
  OREVA.toast = toast; OREVA.icon = icon; OREVA.esc = esc; OREVA.store = store; OREVA.$ = $; OREVA.$$ = $$;
  OREVA.api = api; OREVA.ready = readyP; OREVA.Auth = Auth; OREVA.Ref = Ref; OREVA.emit = emit;
  OREVA.cents = cents; OREVA.fmtDate = fmtDate; OREVA.stars = stars; OREVA.avatarHtml = avatarHtml;
  OREVA.trackingHtml = trackingHtml; OREVA.estimateText = estimateText; OREVA.STATUS = STATUS; OREVA.FLOW = FLOW;
  OREVA.fileToJpeg = fileToJpeg; OREVA.dataUrlToBlob = dataUrlToBlob; OREVA.uploadFile = uploadFile; OREVA.copyText = copyText;
  OREVA.offerDenied = false;
  Object.defineProperty(OREVA, 'mode', { get: function () { return MODE; } });
})();
