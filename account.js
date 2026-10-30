/* ==========================================================
   OREVA - espace client (compte.html)
   connexion / inscription, commandes + suivi, affiliation, retraits, profil
   ========================================================== */
(function () {
  'use strict';

  var O = window.OREVA, CONFIG = O.CONFIG, AFF = CONFIG.affiliate;
  var $ = O.$, $$ = O.$$, esc = O.esc, icon = O.icon, Auth = O.Auth, api = O.api, money = O.money, cents = O.cents;
  var qs = new URLSearchParams(location.search);

  /* on ne redirige que vers une page de CE site */
  function safeNext() { var n = qs.get('next') || ''; return /^[a-z0-9_.\-]+\.html(#[\w\-]*)?$/i.test(n) ? n : ''; }

  var els = {
    loading: $('#acctLoading'), auth: $('#authView'), dash: $('#dashView'), panel: $('#panel'),
    login: $('#loginForm'), signup: $('#signupForm'), me: $('#dashMe'), nav: $('#dashNav')
  };
  var cache = { orders: null, aff: null, demoTools: false };
  var avatarData = '';                                   // photo choisie a l'inscription

  /* ---------- petits utilitaires de formulaire ---------- */
  function setErr(form, name, msg) {
    var e = $('[data-err="' + name + '"]', form); if (!e) return;
    e.textContent = msg || '';
    var w = e.closest('.field'); if (w) w.classList.toggle('has-error', !!msg);
  }
  function clearErrs(form) { $$('[data-err]', form).forEach(function (e) { e.textContent = ''; var w = e.closest('.field'); if (w) w.classList.remove('has-error'); }); var a = $('[data-alert]', form); if (a) a.hidden = true; }
  function alertBox(form, msg) { var a = $('[data-alert]', form); if (!a) return; a.hidden = false; a.textContent = msg; }
  function busy(form, on) { var b = $('button[type=submit]', form); if (!b) return; b.disabled = on; b.classList.toggle('is-loading', on); }
  function applyFields(form, fields) { Object.keys(fields || {}).forEach(function (k) { setErr(form, k, fields[k]); }); }

  /* ==========================================================
     VUES
     ========================================================== */
  function showView() {
    els.loading.hidden = true;
    var u = Auth.user;
    if (u && safeNext()) { location.replace(safeNext()); return; }
    els.auth.hidden = !!u; els.dash.hidden = !u;
    if (u) { renderSide(); route(); }
    else setAuthMode(qs.get('mode') === 'signup' || location.hash === '#inscription' ? 'signup' : 'login');
    renderDemoBanner();
  }

  function renderDemoBanner() {
    var b = $('#demoBanner'); if (!b) return;
    if (O.mode === 'demo') {
      b.hidden = false;
      b.innerHTML = icon('shield') + '<span><b>Mode démonstration :</b> sans serveur, votre compte, vos commandes et vos gains restent dans ce navigateur uniquement. Lancez <code>node server.js</code> pour de vrais comptes partagés.</span>';
    } else b.hidden = true;
  }

  /* ---------- connexion / inscription ---------- */
  function setAuthMode(mode) {
    var login = mode === 'login';
    els.login.hidden = !login; els.signup.hidden = login;
    $('#tabLogin').setAttribute('aria-selected', login ? 'true' : 'false');
    $('#tabSignup').setAttribute('aria-selected', login ? 'false' : 'true');
    document.title = (login ? 'Connexion' : 'Créer un compte') + ' | ' + CONFIG.shop.name;
  }
  $('#tabLogin').addEventListener('click', function () { setAuthMode('login'); });
  $('#tabSignup').addEventListener('click', function () { setAuthMode('signup'); });
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button') : null; if (!t) return;
    if (t.matches('[data-go-signup]')) setAuthMode('signup');
    else if (t.matches('[data-go-login]')) setAuthMode('login');
    else if (t.matches('[data-forgot]')) { var b = $('[data-forgot-box]'); b.hidden = !b.hidden; }
    else if (t.matches('[data-toggle-pw]')) {
      var inp = $('input', t.parentNode), show = inp.type === 'password';
      inp.type = show ? 'text' : 'password'; t.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    }
  });

  function afterAuth(user) {
    Auth.set(user);
    var n = safeNext();
    if (n) { location.href = n; return; }
    location.hash = '#commandes';
    showView();
  }

  els.login.addEventListener('submit', function (e) {
    e.preventDefault(); clearErrs(els.login);
    var f = els.login.elements, email = f.email.value.trim(), pw = f.password.value, bad = false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setErr(els.login, 'email', 'Entrez un courriel valide'); bad = true; }
    if (!pw) { setErr(els.login, 'password', 'Entrez votre mot de passe'); bad = true; }
    if (bad) return;
    busy(els.login, true);
    api('POST', '/auth/login', { email: email, password: pw }).then(function (r) {
      busy(els.login, false);
      if (r.status === 200) return afterAuth(r.data.user);
      if (r.status === 429) return alertBox(els.login, 'Trop de tentatives. Patientez 15 minutes ou contactez-nous.');
      alertBox(els.login, 'Courriel ou mot de passe incorrect.');
    }).catch(function () { busy(els.login, false); alertBox(els.login, 'Connexion impossible. Réessayez dans un instant.'); });
  });

  /* photo de profil : recadree en carre et reduite dans le navigateur */
  $('#avFile').addEventListener('change', function (e) {
    var file = e.target.files[0]; e.target.value = ''; if (!file) return;
    setErr(els.signup, 'avatar', '');
    if (!/^image\//.test(file.type)) return setErr(els.signup, 'avatar', 'Choisissez une image (JPEG, PNG ou WebP).');
    O.fileToJpeg(file, 320, 0.86, true).then(function (d) {
      avatarData = d; var p = $('#avPrev'); p.src = d; p.hidden = false; $('#avDrop').classList.add('has-photo');
    }).catch(function () { setErr(els.signup, 'avatar', 'Cette image ne peut pas être lue. Essayez un fichier JPEG ou PNG.'); });
  });

  els.signup.addEventListener('submit', function (e) {
    e.preventDefault(); clearErrs(els.signup);
    var f = els.signup.elements, bad = false;
    var d = { firstName: f.firstName.value.trim(), lastName: f.lastName.value.trim(), email: f.email.value.trim(), password: f.password.value };
    if (!avatarData) { setErr(els.signup, 'avatar', 'Ajoutez votre photo de profil pour continuer.'); bad = true; $('#avDrop').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    if (!d.firstName) { setErr(els.signup, 'firstName', 'Entrez votre prénom'); bad = true; }
    if (!d.lastName) { setErr(els.signup, 'lastName', 'Entrez votre nom'); bad = true; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) { setErr(els.signup, 'email', 'Entrez un courriel valide'); bad = true; }
    if (d.password.length < 8) { setErr(els.signup, 'password', 'Au moins 8 caractères'); bad = true; }
    if (!f.terms.checked) { setErr(els.signup, 'terms', 'Veuillez accepter les conditions pour continuer.'); bad = true; }
    if (bad) return;
    busy(els.signup, true);
    d.avatar = avatarData; d.termsAccepted = true;
    api('POST', '/auth/signup', d).then(function (r) {
      busy(els.signup, false);
      if (r.status === 201) { O.toast('Bienvenue chez Oreva !'); return afterAuth(r.data.user); }
      if (r.data && r.data.fields) { applyFields(els.signup, r.data.fields); if (r.data.error === 'email_taken') alertBox(els.signup, 'Un compte existe déjà avec ce courriel : connectez-vous.'); return; }
      if (r.status === 507) return alertBox(els.signup, 'Espace de stockage plein dans ce navigateur.');
      alertBox(els.signup, 'Une erreur est survenue. Réessayez dans un instant.');
    }).catch(function () { busy(els.signup, false); alertBox(els.signup, 'Connexion impossible. Réessayez dans un instant.'); });
  });

  /* ==========================================================
     TABLEAU DE BORD
     ========================================================== */
  var TABS = [
    { id: 'commandes', label: 'Mes commandes', ic: 'box' },
    { id: 'affiliation', label: 'Affiliation', ic: 'chart' },
    { id: 'retraits', label: 'Retraits', ic: 'wallet' },
    { id: 'profil', label: 'Mon profil', ic: 'user' }
  ];
  function currentTab() { var h = location.hash.replace('#', ''); return TABS.some(function (t) { return t.id === h; }) ? h : 'commandes'; }

  function renderSide() {
    var u = Auth.user; if (!u) return;
    els.me.innerHTML = O.avatarHtml(u, 84, 'av-xl') + '<b>' + esc(u.firstName + ' ' + u.lastName) + '</b><span>' + esc(u.email) + '</span>' +
      (u.affiliate ? '<em class="pill pill-aff">' + icon('spark') + ' Affilié(e) · ' + esc(u.affiliate.code) + '</em>' : '');
    var cur = currentTab();
    els.nav.innerHTML = TABS.map(function (t) {
      return '<a href="#' + t.id + '"' + (t.id === cur ? ' aria-current="page"' : '') + '>' + icon(t.ic) + '<span>' + t.label + '</span></a>';
    }).join('') + '<button type="button" data-logout>' + icon('logout') + '<span>Déconnexion</span></button>';
  }

  function route() {
    if (!Auth.user) return;
    var tab = currentTab();
    $$('#dashNav a').forEach(function (a) { if (a.getAttribute('href') === '#' + tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    els.panel.innerHTML = '<p class="acct-loading">Chargement…</p>';
    ({ commandes: loadOrders, affiliation: loadAffiliate, retraits: loadWithdraw, profil: renderProfile })[tab]();
  }
  window.addEventListener('hashchange', function () { if (Auth.user) route(); else if (location.hash === '#inscription') setAuthMode('signup'); });

  function pill(kind, text) { return '<span class="pill pill-' + kind + '">' + esc(text) + '</span>'; }
  var ORDER_PILL = { received: 'info', preparing: 'info', shipped: 'warn', delivered: 'ok', cancelled: 'bad' };

  /* ---------- COMMANDES ---------- */
  function loadOrders() {
    api('GET', '/orders').then(function (r) {
      if (r.status !== 200) return renderError();
      cache.orders = r.data.orders; cache.demoTools = r.data.demoTools; renderOrders(r.data.hasReview);
    }).catch(renderError);
  }
  function renderError() { els.panel.innerHTML = '<div class="empty-card"><h2>Un problème est survenu</h2><p>Impossible de charger cette section. <button class="link-btn" type="button" data-retry>Réessayer</button></p></div>'; }

  function orderCard(o, hasReview) {
    var addr = o.customer;
    var canCancel = o.status === 'received' || o.status === 'preparing';
    var canAdvance = cache.demoTools && O.FLOW.indexOf(o.status) >= 0 && o.status !== 'delivered';
    return '<article class="order" id="order-' + esc(o.id) + '">' +
      '<header class="order-head"><div><b>' + esc(o.id) + '</b><span>' + esc(O.fmtDate(o.createdAt)) + '</span></div>' +
      pill(ORDER_PILL[o.status] || 'info', O.STATUS[o.status] || o.status) +
      '<strong class="order-total">' + money(o.pricing.total) + '</strong></header>' +
      '<div class="order-body">' +
      '<div class="order-item"><span class="order-img"><img src="' + esc(CONFIG.product.image) + '" alt=""></span>' +
      '<div><b>' + esc(CONFIG.product.name) + '</b><span class="muted">' + esc(CONFIG.product.brand) + ' · ' + esc(CONFIG.product.size) + ' · Quantité : ' + o.qty + '</span>' +
      '<span class="muted">Sous-total ' + money(o.pricing.subtotal) + (o.pricing.discount ? ' · rabais −' + money(o.pricing.discount) : '') + ' · livraison ' + (o.pricing.shipping ? money(o.pricing.shipping) : 'offerte') + '</span>' +
      (o.payment && o.payment.last4 ? '<span class="muted">Payé par ' + esc(o.payment.brand || 'carte') + ' •••• ' + esc(o.payment.last4) + (o.paymentStatus === 'test' ? ' (test)' : '') + '</span>' : '') + '</div></div>' +
      '<div class="order-track">' + O.trackingHtml(o) + '</div>' +
      '<p class="order-addr">' + icon('truck') + '<span>Livraison à : ' + esc(addr.firstName + ' ' + addr.lastName) + ', ' + esc(addr.address) + (addr.address2 ? ', ' + esc(addr.address2) : '') + ', ' + esc(addr.city) + ' ' + esc(addr.region) + ' ' + esc(addr.postal) + ', ' + esc(addr.country) + '</span></p>' +
      '</div>' +
      '<footer class="order-actions">' +
      (o.status !== 'cancelled' ? '<button class="btn btn-ghost-dark" type="button" data-write-review>' + icon('edit') + (hasReview ? ' Modifier mon avis' : ' Donner mon avis') + '</button>' : '') +
      (canCancel ? '<button class="btn btn-ghost-dark is-danger" type="button" data-cancel="' + esc(o.id) + '">Annuler la commande</button>' : '') +
      (canAdvance ? '<button class="btn btn-demo" type="button" data-advance="' + esc(o.id) + '" title="Outil de démonstration : simule l\'avancement par la boutique">' + icon('play') + ' Test : étape suivante</button>' : '') +
      '</footer></article>';
  }

  function renderOrders(hasReview) {
    var list = cache.orders || [];
    els.panel.innerHTML =
      '<header class="panel-head"><div><h1>Mes commandes</h1><p>Retrouvez vos achats et suivez leur livraison.</p></div>' +
      '<a class="btn btn-primary" href="index.html#produit">' + icon('bag') + ' Commander</a></header>' +
      (list.length ? list.map(function (o) { return orderCard(o, hasReview); }).join('') :
        '<div class="empty-card">' + icon('box', 'ic-xl') + '<h2>Aucune commande pour l\'instant</h2><p>Quand vous passerez commande connecté(e), elle apparaîtra ici avec son suivi.</p><a class="btn btn-primary btn-lg" href="index.html#produit">Découvrir le soin ' + icon('arrow') + '</a></div>') +
      '<details class="claim"><summary>Une commande passée sans compte ? Rattachez-la à votre compte</summary>' +
      '<form id="claimForm" class="claim-form" novalidate><div class="grid-2">' +
      '<div class="field"><label for="cl-id">Numéro de commande</label><input id="cl-id" name="orderId" placeholder="OR-1001" autocomplete="off"><small class="err" data-err="orderId"></small></div>' +
      '<div class="field"><label for="cl-email">Courriel utilisé à la commande</label><input id="cl-email" name="email" type="email" autocomplete="email"><small class="err" data-err="email"></small></div></div>' +
      '<p class="co-alert bad" data-alert hidden role="alert"></p>' +
      '<button class="btn btn-primary" type="submit"><span class="spinner" aria-hidden="true"></span><span class="pay-label">Rattacher la commande</span></button></form></details>';
  }

  /* ---------- AFFILIATION ---------- */
  function loadAffiliate() {
    if (!Auth.user.affiliate) return renderJoin();
    api('GET', '/affiliate').then(function (r) {
      if (r.status === 404) { Auth.user.affiliate = null; return renderJoin(); }
      if (r.status !== 200) return renderError();
      cache.aff = r.data; cache.demoTools = r.data.demoTools; renderAffiliate();
    }).catch(renderError);
  }

  function renderJoin() {
    var ex = CONFIG.product.price * AFF.percent / 100;
    els.panel.innerHTML =
      '<header class="panel-head"><div><h1>Programme d\'affiliation</h1><p>Recommandez Oreva et gagnez de l\'argent sur chaque commande.</p></div></header>' +
      '<div class="join-card">' +
      '<div class="join-pitch"><span class="eyebrow">Gratuit · sans engagement</span>' +
      '<h2>Gagnez <em>' + AFF.percent + '&nbsp;%</em> sur chaque commande que vous recommandez</h2>' +
      '<ol class="join-steps">' +
      '<li><b>1</b><span>Créez votre profil affilié en un clic : vous recevez un code et un lien personnels.</span></li>' +
      '<li><b>2</b><span>Partagez votre lien. Chaque achat fait avec votre lien vous rapporte une commission.</span></li>' +
      '<li><b>3</b><span>Suivez vos gains en direct dans ce compte, puis retirez-les sur votre compte bancaire dès <b>' + money(AFF.minWithdraw) + '</b>.</span></li></ol>' +
      '<p class="join-ex">Exemple : une commande de 2 pots ' + (CONFIG.shipping.freeOver <= CONFIG.product.price * 2 ? '' : '') + 'vous rapporte environ <b>' + money(ex * 2) + '</b>. 10 commandes de 1 pot : environ <b>' + money(ex * 10) + '</b>.</p></div>' +
      '<form id="joinForm" class="join-form" novalidate>' +
      '<div class="join-ic">' + icon('spark') + '</div><h3>Devenir affilié(e)</h3>' +
      '<p class="muted">Votre compte actuel (' + esc(Auth.user.email) + ') devient aussi votre compte affilié : tout est au même endroit.</p>' +
      '<div class="terms"><label class="check"><input type="checkbox" name="terms"><span>J\'accepte les <a class="text-link" href="infos.html#affiliation-conditions" target="_blank" rel="noopener">conditions du programme d\'affiliation</a>.</span></label><small class="err" data-err="terms"></small></div>' +
      '<p class="co-alert bad" data-alert hidden role="alert"></p>' +
      '<button class="btn btn-primary btn-lg btn-block" type="submit"><span class="spinner" aria-hidden="true"></span><span class="pay-label">Créer mon profil affilié</span></button></form></div>';
  }

  function shareUrl(code) { try { return new URL('index.html?ref=' + code, location.href).href; } catch (e) { return 'index.html?ref=' + code; } }

  function renderAffiliate() {
    var a = cache.aff, st = a.stats, url = shareUrl(a.code);
    var text = 'Je te recommande Bright Boost Gel Cream sur Oreva : ' + url + ' (lien d\'affiliation : je reçois une commission si tu commandes).';
    els.panel.innerHTML =
      '<header class="panel-head"><div><h1>Affiliation</h1><p>Vos gains et vos performances, en direct.</p></div>' +
      '<a class="btn btn-primary" href="#retraits">' + icon('wallet') + ' Retirer mes gains</a></header>' +
      '<div class="stat-grid">' +
      '<div class="stat stat-main"><span>Solde disponible</span><b>' + cents(st.availableCents) + '</b><small>Retirable dès ' + cents(a.minWithdrawCents) + '</small></div>' +
      '<div class="stat"><span>En attente</span><b>' + cents(st.pendingCents) + '</b><small>Commandes pas encore livrées</small></div>' +
      '<div class="stat"><span>Total gagné</span><b>' + cents(st.earnedCents + st.paidCents) + '</b><small>Depuis le début</small></div>' +
      '<div class="stat"><span>Déjà versé</span><b>' + cents(st.paidCents) + '</b><small>' + cents(st.inProcessCents) + ' en traitement</small></div></div>' +
      '<div class="link-card"><div><h2>Votre lien de parrainage</h2><p class="muted">Chaque client qui commande après avoir cliqué sur ce lien (valide ' + AFF.cookieDays + ' jours) vous rapporte <b>' + a.percent + '&nbsp;%</b>.</p></div>' +
      '<div class="link-row"><input id="affLink" readonly value="' + esc(url) + '" aria-label="Votre lien de parrainage"><button class="btn btn-primary" type="button" data-copy="' + esc(url) + '">' + icon('copy') + ' Copier le lien</button></div>' +
      '<div class="link-meta"><span>Votre code : <code>' + esc(a.code) + '</code> <button class="link-btn" type="button" data-copy="' + esc(a.code) + '">Copier</button></span>' +
      '<span class="share-btns">' +
      (navigator.share ? '<button class="btn btn-ghost-dark" type="button" data-share>' + icon('share') + ' Partager</button>' : '') +
      '<a class="btn btn-ghost-dark" href="mailto:?subject=' + encodeURIComponent('Un soin à découvrir') + '&body=' + encodeURIComponent(text) + '">' + icon('mail') + ' Courriel</a>' +
      '<a class="btn btn-ghost-dark" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=' + encodeURIComponent(text) + '">' + icon('chat') + ' WhatsApp</a></span></div>' +
      (O.mode === 'demo' ? '<p class="demo-note"><b>Mode démonstration :</b> ce lien ne fonctionne que dans ce navigateur. Une fois le site en ligne, il sera partageable avec n\'importe qui.</p>' : '') +
      '<p class="muted small">Transparence : dites clairement que vous touchez une commission. Les conditions complètes sont <a class="text-link" href="infos.html#affiliation-conditions">ici</a>.</p></div>' +
      '<div class="perf-row"><div><b>' + st.visits + '</b><span>visites via votre lien</span></div><div><b>' + st.orders + '</b><span>commandes</span></div><div><b>' + String(st.conversion).replace('.', ',') + '&nbsp;%</b><span>taux de conversion</span></div></div>' +
      '<section class="table-card"><h2>Vos commissions</h2>' + commissionsTable(a.commissions) + '</section>';
  }

  var COMM_PILL = { pending: ['warn', 'En attente de livraison'], available: ['ok', 'Disponible'], cancelled: ['bad', 'Annulée'] };
  function commissionsTable(list) {
    if (!list.length) return '<div class="empty-inline">' + icon('chart', 'ic-xl') + '<p><b>Pas encore de commission.</b><br>Partagez votre lien : dès qu\'une commande est passée avec votre code, elle apparaît ici.</p></div>';
    return '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Commande</th><th class="num">Montant</th><th class="num">Commission</th><th>Statut</th></tr></thead><tbody>' +
      list.map(function (c) {
        var p = COMM_PILL[c.status];
        return '<tr><td>' + esc(O.fmtDate(c.createdAt)) + '</td><td>' + esc(c.orderId) + ' · ' + c.qty + ' pot' + (c.qty > 1 ? 's' : '') + '</td><td class="num">' + cents(c.baseCents) + '</td><td class="num"><b>' + cents(c.amountCents) + '</b> <small>(' + c.percent + '&nbsp;%)</small></td><td>' + pill(p[0], p[1]) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="muted small">La commission devient disponible quand la commande est livrée.</p>';
  }

  /* ---------- RETRAITS ---------- */
  function loadWithdraw() {
    if (!Auth.user.affiliate) {
      els.panel.innerHTML = '<header class="panel-head"><div><h1>Retraits</h1></div></header><div class="empty-card">' + icon('wallet', 'ic-xl') + '<h2>Devenez affilié(e) pour gagner de l\'argent</h2><p>Créez votre profil affilié, partagez votre lien, puis retirez vos gains sur votre compte bancaire.</p><a class="btn btn-primary btn-lg" href="#affiliation">Voir le programme ' + icon('arrow') + '</a></div>';
      return;
    }
    api('GET', '/affiliate').then(function (r) {
      if (r.status !== 200) return renderError();
      cache.aff = r.data; cache.demoTools = r.data.demoTools; renderWithdraw();
    }).catch(renderError);
  }

  var W_PILL = { pending: ['warn', 'En traitement'], paid: ['ok', 'Versé'], rejected: ['bad', 'Refusé'] };
  function renderWithdraw() {
    var a = cache.aff, st = a.stats, can = st.availableCents >= a.minWithdrawCents, bank = a.bank;
    els.panel.innerHTML =
      '<header class="panel-head"><div><h1>Retraits</h1><p>Retirez vos gains sur votre compte bancaire quand vous le souhaitez.</p></div></header>' +
      '<div class="stat-grid stat-grid-3">' +
      '<div class="stat stat-main"><span>Disponible à retirer</span><b>' + cents(st.availableCents) + '</b><small>Minimum ' + cents(a.minWithdrawCents) + ' par retrait</small></div>' +
      '<div class="stat"><span>En traitement</span><b>' + cents(st.inProcessCents) + '</b><small>Demandes envoyées</small></div>' +
      '<div class="stat"><span>Déjà versé</span><b>' + cents(st.paidCents) + '</b><small>Sur votre compte</small></div></div>' +
      (O.mode === 'demo' || cache.demoTools ? '<p class="demo-note"><b>Mode démonstration :</b> aucun argent réel n\'est versé. Ne saisissez pas de vrais numéros de compte. En production, seuls les 4 derniers chiffres de votre compte sont conservés.</p>' : '') +
      '<div class="withdraw-grid"><form id="wForm" class="table-card" novalidate>' +
      '<h2>Demander un retrait</h2>' +
      (can ? '' : '<p class="co-alert warn">Votre solde disponible est inférieur au minimum de ' + cents(a.minWithdrawCents) + '. ' + (st.pendingCents ? 'Vous avez ' + cents(st.pendingCents) + ' en attente de livraison.' : 'Partagez votre lien pour commencer à gagner.') + '</p>') +
      '<div class="field"><label for="w-amount">Montant à retirer (' + esc(CONFIG.currency) + ')</label>' +
      '<div class="amount-row"><input id="w-amount" name="amount" inputmode="decimal" placeholder="0,00" autocomplete="off"' + (can ? '' : ' disabled') + '><button class="btn btn-ghost-dark" type="button" data-withdraw-all' + (can ? '' : ' disabled') + '>Tout retirer</button></div>' +
      '<small class="err" data-err="amount"></small></div>' +
      (bank ? '<fieldset class="saved-bank"><label class="check"><input type="radio" name="bankChoice" value="saved" checked><span>Utiliser le compte enregistré : <b>' + esc(bank.institution) + ' •••• ' + esc(bank.last4) + '</b> (' + esc(bank.holder) + ')</span></label>' +
        '<label class="check"><input type="radio" name="bankChoice" value="new"><span>Utiliser un autre compte</span></label></fieldset>' : '') +
      '<div id="bankFields"' + (bank ? ' hidden' : '') + '>' +
      '<div class="field"><label for="w-holder">Titulaire du compte</label><input id="w-holder" name="holder" autocomplete="name" value="' + esc(Auth.user.firstName + ' ' + Auth.user.lastName) + '"><small class="err" data-err="holder"></small></div>' +
      '<div class="field"><label for="w-inst">Banque / institution</label><input id="w-inst" name="institution" placeholder="Ex. : Banque Exemple" autocomplete="off"><small class="err" data-err="institution"></small></div>' +
      '<div class="field"><label for="w-acc">Numéro de compte ou IBAN</label><input id="w-acc" name="account" autocomplete="off" inputmode="text" placeholder="Numéro de compte fictif en démo"><small class="err" data-err="account"></small></div></div>' +
      '<p class="co-alert bad" data-alert hidden role="alert"></p>' +
      '<button class="btn btn-primary btn-lg btn-block" type="submit"' + (can ? '' : ' disabled') + '><span class="spinner" aria-hidden="true"></span><span class="pay-label">Demander le retrait</span></button>' +
      '<p class="muted small">Versement par virement bancaire. Délai habituel après validation : 1 à 3 jours ouvrables.</p></form>' +
      '<section class="table-card"><h2>Historique des retraits</h2>' + withdrawalsTable(a.withdrawals) + '</section></div>';
  }

  function withdrawalsTable(list) {
    if (!list.length) return '<div class="empty-inline">' + icon('wallet', 'ic-xl') + '<p><b>Aucun retrait pour l\'instant.</b><br>Vos demandes et leur statut s\'afficheront ici.</p></div>';
    return '<div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Montant</th><th>Compte</th><th>Statut</th></tr></thead><tbody>' + list.map(function (w) {
      var p = W_PILL[w.status];
      return '<tr><td>' + esc(O.fmtDate(w.createdAt)) + '</td><td class="num"><b>' + cents(w.amountCents) + '</b></td><td>' + esc(w.bank.institution) + ' •••• ' + esc(w.bank.last4) + '</td><td>' + pill(p[0], p[1]) +
        (w.note ? '<small class="note">' + esc(w.note) + '</small>' : '') +
        (w.status === 'pending' && cache.demoTools ? '<button class="link-btn" type="button" data-payout="' + esc(w.id) + '">Simuler le versement</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  /* ---------- PROFIL ---------- */
  function renderProfile() {
    var u = Auth.user;
    els.panel.innerHTML =
      '<header class="panel-head"><div><h1>Mon profil</h1><p>Vos informations et votre photo de profil.</p></div></header>' +
      '<section class="table-card"><h2>Photo de profil</h2><div class="avatar-pick"><input id="pAvFile" type="file" class="sr-only" accept="image/*">' +
      '<label for="pAvFile" class="avatar-drop has-photo" aria-label="Changer ma photo de profil"><img id="pAvPrev" src="' + esc(u.avatar) + '" alt="Ma photo de profil"><span class="avatar-badge">' + icon('camera') + '</span></label>' +
      '<div class="avatar-txt"><b>Cette photo s\'affiche avec vos avis.</b><small>Cliquez sur la photo pour la changer.</small><small class="err" id="pAvErr"></small></div></div></section>' +
      '<section class="table-card"><h2>Informations</h2><form id="profileForm" novalidate><div class="grid-2">' +
      '<div class="field"><label for="p-first">Prénom</label><input id="p-first" name="firstName" value="' + esc(u.firstName) + '" autocomplete="given-name"><small class="err" data-err="firstName"></small></div>' +
      '<div class="field"><label for="p-last">Nom</label><input id="p-last" name="lastName" value="' + esc(u.lastName) + '" autocomplete="family-name"><small class="err" data-err="lastName"></small></div>' +
      '<div class="field full"><label for="p-email">Courriel</label><input id="p-email" value="' + esc(u.email) + '" disabled><small class="muted">Pour changer de courriel, contactez-nous.</small></div></div>' +
      '<button class="btn btn-primary" type="submit"><span class="spinner" aria-hidden="true"></span><span class="pay-label">Enregistrer</span></button></form></section>' +
      '<section class="table-card"><h2>Mot de passe</h2><form id="pwForm" novalidate><div class="grid-2">' +
      '<div class="field"><label for="pw-cur">Mot de passe actuel</label><input id="pw-cur" name="current" type="password" autocomplete="current-password"><small class="err" data-err="current"></small></div>' +
      '<div class="field"><label for="pw-new">Nouveau mot de passe</label><input id="pw-new" name="next" type="password" autocomplete="new-password"><small class="err" data-err="next"></small></div></div>' +
      '<p class="co-alert bad" data-alert hidden role="alert"></p>' +
      '<button class="btn btn-primary" type="submit"><span class="spinner" aria-hidden="true"></span><span class="pay-label">Changer le mot de passe</span></button></form></section>';
  }

  /* ==========================================================
     ACTIONS (delegation)
     ========================================================== */
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button') : null; if (!t) return;

    if (t.matches('[data-retry]')) return route();

    if (t.matches('[data-cancel]')) {
      if (!window.confirm('Annuler cette commande ?')) return;
      api('POST', '/orders/' + t.dataset.cancel + '/cancel', {}).then(function (r) { if (r.status === 200) { O.toast('Commande annulée'); route(); } else O.toast('Cette commande ne peut plus être annulée'); });
    } else if (t.matches('[data-advance]')) {
      t.disabled = true;
      api('POST', '/demo/advance', { orderId: t.dataset.advance }).then(function (r) { if (r.status === 200) { O.toast('Étape suivante : ' + O.STATUS[r.data.order.status]); } route(); });
    } else if (t.matches('[data-share]')) {
      navigator.share({ title: 'Bright Boost Gel Cream · Oreva', text: 'Je te recommande ce soin (lien d\'affiliation).', url: shareUrl(cache.aff.code) }).catch(function () {});
    } else if (t.matches('[data-withdraw-all]')) {
      var inp = $('#w-amount'); if (inp) inp.value = (cache.aff.stats.availableCents / 100).toFixed(2).replace('.', ',');
    } else if (t.matches('[data-payout]')) {
      api('POST', '/demo/payout', { id: t.dataset.payout }).then(function () { O.toast('Versement simulé'); route(); });
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.name === 'bankChoice') { $('#bankFields').hidden = e.target.value === 'saved'; }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;

    if (f.id === 'joinForm') {
      e.preventDefault(); clearErrs(f);
      if (!f.elements.terms.checked) return setErr(f, 'terms', 'Veuillez accepter les conditions pour continuer.');
      busy(f, true);
      api('POST', '/affiliate/join', { termsAccepted: true }).then(function (r) {
        busy(f, false);
        if (r.status === 201) { Auth.set(r.data.user); renderSide(); O.toast('Bienvenue dans le programme !'); loadAffiliate(); }
        else alertBox(f, 'Une erreur est survenue. Réessayez.');
      });
    }

    else if (f.id === 'wForm') {
      e.preventDefault(); clearErrs(f);
      var raw = f.elements.amount.value.replace(',', '.').replace(/[^\d.]/g, ''), amount = Math.round(parseFloat(raw) * 100);
      var useSaved = cache.aff.bank && (f.elements.bankChoice ? f.elements.bankChoice.value === 'saved' : false);
      var payload = { amountCents: amount, useSaved: !!useSaved };
      if (!useSaved) { payload.holder = f.elements.holder.value; payload.institution = f.elements.institution.value; payload.account = f.elements.account.value; }
      if (!(amount > 0)) return setErr(f, 'amount', 'Entrez un montant');
      busy(f, true);
      api('POST', '/affiliate/withdraw', payload).then(function (r) {
        busy(f, false);
        if (r.status === 201) { O.toast('Demande de retrait envoyée'); return loadWithdraw(); }
        if (r.data && r.data.fields) return applyFields(f, r.data.fields);
        alertBox(f, 'Une erreur est survenue. Réessayez.');
      });
    }

    else if (f.id === 'claimForm') {
      e.preventDefault(); clearErrs(f);
      var id = f.elements.orderId.value.trim(), em = f.elements.email.value.trim();
      if (!id) return setErr(f, 'orderId', 'Entrez le numéro de commande');
      if (!em) return setErr(f, 'email', 'Entrez votre courriel');
      busy(f, true);
      api('POST', '/orders/claim', { orderId: id, email: em }).then(function (r) {
        busy(f, false);
        if (r.status === 200) { O.toast('Commande rattachée à votre compte'); return loadOrders(); }
        alertBox(f, r.status === 409 ? 'Cette commande est déjà liée à un autre compte.' : 'Aucune commande ne correspond à ce numéro et à ce courriel.');
      });
    }

    else if (f.id === 'profileForm') {
      e.preventDefault(); clearErrs(f);
      busy(f, true);
      api('PUT', '/account', { firstName: f.elements.firstName.value, lastName: f.elements.lastName.value }).then(function (r) {
        busy(f, false);
        if (r.status === 200) { Auth.set(r.data.user); renderSide(); O.toast('Profil enregistré'); }
        else if (r.data && r.data.fields) applyFields(f, r.data.fields);
      });
    }

    else if (f.id === 'pwForm') {
      e.preventDefault(); clearErrs(f);
      busy(f, true);
      api('PUT', '/account/password', { current: f.elements.current.value, next: f.elements.next.value }).then(function (r) {
        busy(f, false);
        if (r.status === 200) { f.reset(); O.toast('Mot de passe modifié'); }
        else if (r.data && r.data.fields) applyFields(f, r.data.fields);
        else alertBox(f, 'Une erreur est survenue.');
      });
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id !== 'pAvFile') return;
    var file = e.target.files[0]; e.target.value = ''; if (!file) return;
    var err = $('#pAvErr'); err.textContent = '';
    if (!/^image\//.test(file.type)) { err.textContent = 'Choisissez une image (JPEG, PNG ou WebP).'; return; }
    O.fileToJpeg(file, 320, 0.86, true).then(function (d) {
      return api('PUT', '/account/avatar', { avatar: d });
    }).then(function (r) {
      if (r.status === 200) { Auth.set(r.data.user); renderSide(); $('#pAvPrev').src = r.data.user.avatar; O.toast('Photo de profil mise à jour'); }
      else err.textContent = r.data && r.data.fields && r.data.fields.avatar || 'Impossible de mettre à jour la photo.';
    }).catch(function () { err.textContent = 'Cette image ne peut pas être lue.'; });
  });

  /* ---------- demarrage ---------- */
  document.addEventListener('oreva:auth', showView);
  if (Auth.loaded) showView();
})();
