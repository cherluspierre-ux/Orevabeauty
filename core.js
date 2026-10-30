/* ==========================================================
   OREVA - noyau metier (comptes, commandes, suivi, affiliation, retraits, avis)

   Ce fichier est utilise par :
   - server.js           (vraie base de donnees, vrais comptes)
   - le navigateur       (MODE DEMO quand il n'y a pas de serveur : tout est
                          garde dans le localStorage de CE navigateur)

   Il ne contient aucun secret. Les mots de passe, les sessions et le
   stockage des fichiers sont fournis par l'hote (opts.crypto / opts.media).
   ========================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OrevaCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var FLOW = ['received', 'preparing', 'shipped', 'delivered'];
  var STATUS_LABEL = {
    received: 'Commande reçue', preparing: 'En préparation', shipped: 'Expédiée',
    delivered: 'Livrée', cancelled: 'Annulée'
  };
  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';      // 32 caracteres, sans O/I/0/1

  function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
  function cents(n) { return Math.round(n * 100); }
  function ok(body, status) { return { status: status || 200, body: body }; }
  function fail(status, error, extra) {
    var b = { error: error }; if (extra) for (var k in extra) b[k] = extra[k];
    return { status: status, body: b };
  }

  function create(opts) {
    var CONFIG = opts.CONFIG, compute = opts.compute, C = opts.crypto, M = opts.media;
    var OFFER = CONFIG.offer, AFF = CONFIG.affiliate, P = CONFIG.product;
    var attempts = {};                                        // limitation des essais de connexion

    function now() { return opts.now ? opts.now() : Date.now(); }
    function iso() { return new Date(now()).toISOString(); }
    function demoMode() { return CONFIG.payment.mode === 'demo'; }

    /* ---------- base de donnees ---------- */
    function emptyDb() {
      return { v: 2, orders: [], subscribers: [], users: [], sessions: [], reviews: [],
        commissions: [], withdrawals: [], uploads: {}, clicks: {}, counters: { order: 1000 } };
    }
    function fix(db) {
      var d = emptyDb();
      Object.keys(d).forEach(function (k) { if (db[k] === undefined) db[k] = d[k]; });
      db.counters = db.counters || { order: 1000 };
      db.orders.forEach(function (o) {
        var n = parseInt(String(o.id).replace(/\D/g, ''), 10) || 0;
        if (n > db.counters.order) db.counters.order = n;
        if (!o.status) { o.status = 'received'; o.history = [{ status: 'received', at: o.createdAt, note: '' }]; }
        if (o.userId === undefined) o.userId = null;
      });
      db.v = 2;
      return db;
    }

    /* ---------- offre -15 % pour les 50 premiers ---------- */
    function offerState(db) {
      var used = db.orders.filter(function (o) { return o.discounted; }).length;
      var remaining = Math.max(0, OFFER.limit - used);
      return { limit: OFFER.limit, percent: OFFER.percent, used: used, remaining: remaining, active: remaining > 0 };
    }
    function offerDecision(db, email) {
      var st = offerState(db);
      if (!st.active) return { on: false, reason: 'offer_sold_out' };
      if (OFFER.oncePerCustomer && db.orders.some(function (o) { return o.discounted && o.customer.email === email; }))
        return { on: false, reason: 'offer_already_used' };
      return { on: true, reason: null };
    }

    /* ---------- vues publiques (on ne renvoie jamais plus que necessaire) ---------- */
    function userView(u) {
      return { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, avatar: u.avatar,
        createdAt: u.createdAt, affiliate: u.affiliate ? { code: u.affiliate.code, joinedAt: u.affiliate.joinedAt } : null };
    }
    function orderView(o, full) {
      var v = { id: o.id, createdAt: o.createdAt, qty: o.qty, pricing: o.pricing, discounted: o.discounted,
        status: o.status, history: o.history, tracking: o.tracking || null, firstName: o.customer.firstName,
        paymentStatus: o.paymentStatus, payment: o.payment || null };
      if (full) { v.customer = o.customer; v.ref = o.ref || null; }
      return v;
    }
    function displayName(u) { return u.firstName + (u.lastName ? ' ' + u.lastName.charAt(0).toUpperCase() + '.' : ''); }
    function reviewView(db, r, viewer) {
      var u = db.users.find(function (x) { return x.id === r.userId; }) || { firstName: 'Client', lastName: '', avatar: '' };
      return { id: r.id, name: displayName(u), avatar: u.avatar, rating: r.rating, title: r.title, body: r.body,
        media: r.media, verified: r.verified, createdAt: r.createdAt, edited: !!r.updatedAt,
        mine: !!(viewer && viewer.id === r.userId), status: r.status };
    }
    function reviewSummary(db) {
      var pub = db.reviews.filter(function (r) { return r.status === 'published'; });
      var dist = [0, 0, 0, 0, 0], sum = 0;
      pub.forEach(function (r) { dist[r.rating - 1]++; sum += r.rating; });
      return { count: pub.length, avg: pub.length ? Math.round(sum / pub.length * 10) / 10 : 0, dist: dist.reverse() };   // dist[0] = 5 etoiles
    }

    /* ---------- statuts de commande ---------- */
    function pushHistory(o, status, note) { o.history.push({ status: status, at: iso(), note: note || '' }); }

    function syncCommission(db, o) {
      var c = db.commissions.find(function (x) { return x.orderId === o.id; });
      if (!c) return;
      if (o.status === 'delivered' && c.status === 'pending') c.status = 'available';
      else if (o.status === 'cancelled' && c.status !== 'cancelled') c.status = 'cancelled';
      c.updatedAt = iso();
    }

    function fakeTracking() {
      var n = ''; for (var i = 0; i < 12; i++) n += String(Math.floor(Math.random() * 10));
      return 'OR' + n + 'CA';
    }

    function setStatus(db, o, status, extra) {
      extra = extra || {};
      if (status === 'shipped') {
        o.tracking = { carrier: str(extra.carrier, 40) || CONFIG.shipping.carrier || 'Transporteur',
          number: str(extra.trackingNumber, 40) || fakeTracking() };
      }
      o.status = status;
      pushHistory(o, status, str(extra.note, 140));
      syncCommission(db, o);
    }

    /* ---------- affiliation : soldes ---------- */
    function affSummary(db, userId) {
      var u = db.users.find(function (x) { return x.id === userId; });
      var mine = db.commissions.filter(function (c) { return c.affiliateUserId === userId; });
      var sum = function (arr) { return arr.reduce(function (s, c) { return s + c.amountCents; }, 0); };
      var pending = sum(mine.filter(function (c) { return c.status === 'pending'; }));
      var availableTotal = sum(mine.filter(function (c) { return c.status === 'available'; }));
      var ws = db.withdrawals.filter(function (w) { return w.userId === userId; });
      var paid = ws.filter(function (w) { return w.status === 'paid'; }).reduce(function (s, w) { return s + w.amountCents; }, 0);
      var inProcess = ws.filter(function (w) { return w.status === 'pending'; }).reduce(function (s, w) { return s + w.amountCents; }, 0);
      var visits = (u && u.affiliate && u.affiliate.visits) || 0;
      var orders = mine.filter(function (c) { return c.status !== 'cancelled'; }).length;
      return {
        pendingCents: pending,
        availableCents: Math.max(0, availableTotal - paid - inProcess),
        paidCents: paid, inProcessCents: inProcess,
        earnedCents: pending + availableTotal,
        visits: visits, orders: orders,
        conversion: visits ? Math.round(orders / visits * 1000) / 10 : 0
      };
    }

    /* ---------- paiement ----------
       Mode test : la carte 4242 4242 4242 4242 reussit, 4000 0000 0000 0002 est refusee.
       >>> En production, server.js fournit opts.processPayment (Stripe / PayPal). */
    async function defaultPay(order, payment) {
      if (payment && payment.last4 === '0002') return { declined: true };
      return { paymentStatus: 'test' };
    }
    var processPayment = opts.processPayment || defaultPay;

    /* ==========================================================
       ROUTES
       ========================================================== */
    var routes = [];
    function route(method, pattern, fn) { routes.push({ method: method, re: new RegExp('^' + pattern + '$'), fn: fn }); }

    function need(x) { return x.user ? null : fail(401, 'auth_required'); }
    function needAdmin(x) { return x.req.admin ? null : fail(401, 'unauthorized'); }
    function loginKey(x, email) { return (x.req.ip || 'x') + '|' + email; }

    async function startSession(x, user) {
      var token = await C.randomToken();
      var h = await C.sha256(token);
      var t = now();
      x.db.sessions = x.db.sessions.filter(function (s) { return s.exp > t; });
      x.db.sessions.push({ h: h, userId: user.id, exp: t + 30 * 864e5 });
      x.dirty = true;
      x.session = { set: token, maxAge: 30 * 86400 };
    }

    /* ---------- offre / abonnement ---------- */
    route('GET', '/offer', async function (x) { return ok(offerState(x.db)); });

    route('POST', '/subscribe', async function (x) {
      var email = str(x.req.body.email, 120).toLowerCase();
      if (!EMAIL_RE.test(email)) return fail(400, 'invalid_email');
      if (!x.db.subscribers.some(function (s) { return s.email === email; })) {
        x.db.subscribers.push({ email: email, createdAt: iso() }); x.dirty = true;
      }
      return ok({ ok: true });
    });

    /* ---------- authentification ---------- */
    route('GET', '/auth/me', async function (x) { return ok({ user: x.user ? userView(x.user) : null, mode: demoMode() ? 'demo' : 'live' }); });

    route('POST', '/auth/signup', async function (x) {
      var b = x.req.body, f = {};
      var u = {
        firstName: str(b.firstName, 40), lastName: str(b.lastName, 40),
        email: str(b.email, 120).toLowerCase()
      };
      var password = typeof b.password === 'string' ? b.password : '';
      if (!u.firstName) f.firstName = 'Entrez votre prénom';
      if (!u.lastName) f.lastName = 'Entrez votre nom';
      if (!EMAIL_RE.test(u.email)) f.email = 'Courriel invalide';
      if (password.length < 8) f.password = 'Au moins 8 caractères';
      if (password.length > 100) f.password = 'Mot de passe trop long';
      if (!b.avatar) f.avatar = 'Ajoutez une photo de profil';
      if (b.termsAccepted !== true) f.terms = 'Vous devez accepter les conditions';
      if (Object.keys(f).length) return fail(400, 'validation', { fields: f });
      if (x.db.users.some(function (z) { return z.email === u.email; }))
        return fail(409, 'email_taken', { fields: { email: 'Un compte existe déjà avec ce courriel. Connectez-vous.' } });

      var avatarUrl;
      try { avatarUrl = await M.saveAvatar(b.avatar); }
      catch (e) { return fail(400, 'validation', { fields: { avatar: 'Photo invalide (JPEG, PNG ou WebP, 400 Ko max).' } }); }

      var user = { id: await C.randomId(), firstName: u.firstName, lastName: u.lastName, email: u.email,
        passwordHash: await C.hashPassword(password), avatar: avatarUrl, createdAt: iso(), affiliate: null };
      x.db.users.push(user);
      await startSession(x, user);
      x.dirty = true;
      return ok({ user: userView(user) }, 201);
    });

    route('POST', '/auth/login', async function (x) {
      var email = str(x.req.body.email, 120).toLowerCase();
      var password = typeof x.req.body.password === 'string' ? x.req.body.password : '';
      var key = loginKey(x, email), a = attempts[key], t = now();
      if (a && a.count >= 8 && t < a.until) return fail(429, 'too_many_attempts');
      var user = x.db.users.find(function (z) { return z.email === email; });
      var good = user && await C.verifyPassword(password, user.passwordHash);
      if (!good) {
        a = attempts[key] = (a && t < a.until) ? a : { count: 0, until: t + 15 * 60000 };
        a.count++;
        return fail(401, 'bad_credentials');
      }
      delete attempts[key];
      await startSession(x, user);
      return ok({ user: userView(user) });
    });

    route('POST', '/auth/logout', async function (x) {
      if (x.req.sid) {
        var h = await C.sha256(x.req.sid);
        x.db.sessions = x.db.sessions.filter(function (s) { return s.h !== h; }); x.dirty = true;
      }
      x.session = { clear: true };
      return ok({ ok: true });
    });

    /* ---------- profil ---------- */
    route('PUT', '/account', async function (x) {
      var d = need(x); if (d) return d;
      var fn = str(x.req.body.firstName, 40), ln = str(x.req.body.lastName, 40), f = {};
      if (!fn) f.firstName = 'Entrez votre prénom';
      if (!ln) f.lastName = 'Entrez votre nom';
      if (Object.keys(f).length) return fail(400, 'validation', { fields: f });
      x.user.firstName = fn; x.user.lastName = ln; x.dirty = true;
      return ok({ user: userView(x.user) });
    });

    route('PUT', '/account/avatar', async function (x) {
      var d = need(x); if (d) return d;
      try { x.user.avatar = await M.saveAvatar(x.req.body.avatar); }
      catch (e) { return fail(400, 'validation', { fields: { avatar: 'Photo invalide (JPEG, PNG ou WebP, 400 Ko max).' } }); }
      x.dirty = true;
      return ok({ user: userView(x.user) });
    });

    route('PUT', '/account/password', async function (x) {
      var d = need(x); if (d) return d;
      var cur = typeof x.req.body.current === 'string' ? x.req.body.current : '';
      var nw = typeof x.req.body.next === 'string' ? x.req.body.next : '';
      if (!(await C.verifyPassword(cur, x.user.passwordHash))) return fail(400, 'validation', { fields: { current: 'Mot de passe actuel incorrect' } });
      if (nw.length < 8 || nw.length > 100) return fail(400, 'validation', { fields: { next: 'Au moins 8 caractères' } });
      x.user.passwordHash = await C.hashPassword(nw);
      // on garde la session courante, on ferme les autres
      var keep = x.req.sid ? await C.sha256(x.req.sid) : null;
      x.db.sessions = x.db.sessions.filter(function (s) { return s.userId !== x.user.id || s.h === keep; });
      x.dirty = true;
      return ok({ ok: true });
    });

    /* ---------- commandes ---------- */
    route('POST', '/order', async function (x) {
      var b = x.req.body;
      var qty = Math.floor(Number(b.qty));
      if (!(qty >= 1 && qty <= P.maxQty)) return fail(400, 'invalid_qty');
      if (b.termsAccepted !== true) return fail(400, 'terms_required');

      var c = b.customer || {};
      var customer = {
        email: str(c.email, 120).toLowerCase(), firstName: str(c.firstName, 60), lastName: str(c.lastName, 60),
        address: str(c.address, 120), address2: str(c.address2, 80), city: str(c.city, 60), region: str(c.region, 60),
        postal: str(c.postal, 12), country: str(c.country, 60), phone: str(c.phone, 30)
      };
      var errors = {};
      if (!EMAIL_RE.test(customer.email)) errors.email = 'Courriel invalide';
      ['firstName', 'lastName', 'address', 'city', 'region', 'postal', 'country'].forEach(function (k) { if (!customer[k]) errors[k] = 'Champ requis'; });
      if (Object.keys(errors).length) return fail(400, 'validation', { fields: errors });

      var decision = offerDecision(x.db, customer.email);
      var pricing = compute(qty, decision.on);
      var totalCents = cents(pricing.total);
      if (Number.isFinite(b.expectedTotalCents) && b.expectedTotalCents !== totalCents)
        return fail(409, 'total_changed', { reason: decision.reason || 'price_changed', pricing: pricing, offer: offerState(x.db) });

      var payInfo = b.payment && typeof b.payment === 'object' ? { method: str(b.payment.method, 20), last4: str(b.payment.last4, 4), brand: str(b.payment.brand, 12) } : null;
      var order = { id: 'OR-' + (x.db.counters.order + 1), createdAt: iso(), qty: qty, pricing: pricing,
        discounted: decision.on, customer: customer, userId: x.user ? x.user.id : null,
        paymentStatus: 'pending', payment: payInfo ? { method: payInfo.method, brand: payInfo.brand, last4: payInfo.last4 } : null,
        status: 'received', history: [], tracking: null, ref: null };

      var pay = await processPayment(order, payInfo);
      if (pay.declined) return fail(402, 'card_declined');
      order.paymentStatus = pay.paymentStatus || 'pending';

      /* parrainage : le code doit exister, et on ne peut pas se parrainer soi-meme */
      var code = str(b.ref, 12).toUpperCase();
      if (code) {
        var aff = x.db.users.find(function (u) { return u.affiliate && u.affiliate.code === code; });
        var self = aff && ((x.user && x.user.id === aff.id) || aff.email === customer.email);
        if (aff && !self) {
          order.ref = code;
          var base = cents(pricing.subtotal - pricing.discount);
          x.db.commissions.push({ id: await C.randomId(), orderId: order.id, code: code, affiliateUserId: aff.id,
            baseCents: base, percent: AFF.percent, amountCents: Math.round(base * AFF.percent / 100),
            status: 'pending', createdAt: iso(), updatedAt: iso(), qty: qty });
        }
      }

      x.db.counters.order += 1;
      pushHistory(order, 'received', '');
      x.db.orders.push(order);
      x.dirty = true;
      return ok({ ok: true, orderId: order.id, pricing: pricing, discounted: order.discounted, offer: offerState(x.db),
        paymentStatus: order.paymentStatus, loggedIn: !!x.user }, 201);
    });

    route('GET', '/orders', async function (x) {
      var d = need(x); if (d) return d;
      var list = x.db.orders.filter(function (o) { return o.userId === x.user.id; })
        .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })
        .map(function (o) { return orderView(o, true); });
      var mine = x.db.reviews.find(function (r) { return r.userId === x.user.id; });
      return ok({ orders: list, demoTools: demoMode(), hasReview: !!mine });
    });

    /* Suivi public : numero de commande + courriel (aucune adresse n'est renvoyee) */
    route('POST', '/track', async function (x) {
      var id = str(x.req.body.orderId, 20).toUpperCase().replace(/\s+/g, '');
      if (/^\d+$/.test(id)) id = 'OR-' + id;
      var email = str(x.req.body.email, 120).toLowerCase();
      var o = x.db.orders.find(function (z) { return z.id === id && z.customer.email === email; });
      if (!o) return fail(404, 'not_found');
      return ok({ order: orderView(o, false) });
    });

    /* Rattacher une commande passee en invite a mon compte (numero + courriel) */
    route('POST', '/orders/claim', async function (x) {
      var d = need(x); if (d) return d;
      var id = str(x.req.body.orderId, 20).toUpperCase().replace(/\s+/g, '');
      if (/^\d+$/.test(id)) id = 'OR-' + id;
      var email = str(x.req.body.email, 120).toLowerCase();
      var o = x.db.orders.find(function (z) { return z.id === id && z.customer.email === email; });
      if (!o) return fail(404, 'not_found');
      if (o.userId && o.userId !== x.user.id) return fail(409, 'already_linked');
      o.userId = x.user.id; x.dirty = true;
      return ok({ order: orderView(o, true) });
    });

    route('POST', '/orders/([A-Za-z0-9-]+)/cancel', async function (x, m) {
      var d = need(x); if (d) return d;
      var o = x.db.orders.find(function (z) { return z.id === m[1] && z.userId === x.user.id; });
      if (!o) return fail(404, 'not_found');
      if (o.status !== 'received' && o.status !== 'preparing') return fail(409, 'cannot_cancel');
      setStatus(x.db, o, 'cancelled', { note: 'Annulée par le client' });
      x.dirty = true;
      return ok({ order: orderView(o, true) });
    });

    /* Outil de demonstration : fait avancer la commande d'une etape (desactive des que le paiement reel est actif) */
    route('POST', '/demo/advance', async function (x) {
      if (!demoMode()) return fail(404, 'not_found');
      var d = need(x); if (d) return d;
      var o = x.db.orders.find(function (z) { return z.id === x.req.body.orderId && z.userId === x.user.id; });
      if (!o) return fail(404, 'not_found');
      var i = FLOW.indexOf(o.status);
      if (i < 0 || i >= FLOW.length - 1) return fail(409, 'nothing_to_advance');
      setStatus(x.db, o, FLOW[i + 1], { note: 'Étape simulée (mode démonstration)' });
      x.dirty = true;
      return ok({ order: orderView(o, true) });
    });

    /* ---------- affiliation ---------- */
    route('POST', '/affiliate/click', async function (x) {
      var code = str(x.req.body.code, 12).toUpperCase();
      var u = x.db.users.find(function (z) { return z.affiliate && z.affiliate.code === code; });
      if (!u) return ok({ ok: false });
      u.affiliate.visits = (u.affiliate.visits || 0) + 1; x.dirty = true;
      return ok({ ok: true });
    });

    route('GET', '/affiliate/check', async function (x) {
      var code = str(x.req.query.code, 12).toUpperCase();
      var u = x.db.users.find(function (z) { return z.affiliate && z.affiliate.code === code; });
      return ok({ valid: !!u });
    });

    route('POST', '/affiliate/join', async function (x) {
      var d = need(x); if (d) return d;
      if (x.req.body.termsAccepted !== true) return fail(400, 'terms_required');
      if (!x.user.affiliate) {
        var code, tries = 0;
        do {
          var hex = await C.randomToken(), s = '';
          for (var i = 0; i < 8; i++) s += CODE_ALPHABET.charAt(parseInt(hex.substr(i * 2, 2), 16) & 31);
          code = s; tries++;
        } while (x.db.users.some(function (z) { return z.affiliate && z.affiliate.code === code; }) && tries < 20);
        x.user.affiliate = { code: code, joinedAt: iso(), visits: 0, bank: null };
        x.dirty = true;
      }
      return ok({ user: userView(x.user) }, 201);
    });

    route('GET', '/affiliate', async function (x) {
      var d = need(x); if (d) return d;
      if (!x.user.affiliate) return fail(404, 'not_affiliate');
      var uid = x.user.id;
      var commissions = x.db.commissions.filter(function (c) { return c.affiliateUserId === uid; })
        .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; }).slice(0, 200)
        .map(function (c) { return { id: c.id, orderId: c.orderId, createdAt: c.createdAt, qty: c.qty, baseCents: c.baseCents, percent: c.percent, amountCents: c.amountCents, status: c.status }; });
      var withdrawals = x.db.withdrawals.filter(function (w) { return w.userId === uid; })
        .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })
        .map(function (w) { return { id: w.id, amountCents: w.amountCents, status: w.status, createdAt: w.createdAt, processedAt: w.processedAt || null, bank: w.bank, note: w.note || '' }; });
      return ok({ code: x.user.affiliate.code, joinedAt: x.user.affiliate.joinedAt, percent: AFF.percent,
        minWithdrawCents: cents(AFF.minWithdraw), stats: affSummary(x.db, uid), commissions: commissions,
        withdrawals: withdrawals, bank: x.user.affiliate.bank || null, demoTools: demoMode() });
    });

    route('POST', '/affiliate/withdraw', async function (x) {
      var d = need(x); if (d) return d;
      if (!x.user.affiliate) return fail(404, 'not_affiliate');
      var b = x.req.body, f = {};
      var amount = Math.round(Number(b.amountCents));
      var holder = str(b.holder, 80), institution = str(b.institution, 60);
      var account = typeof b.account === 'string' ? b.account.replace(/[\s-]/g, '') : '';
      var summary = affSummary(x.db, x.user.id);
      var useSaved = b.useSaved === true && x.user.affiliate.bank;

      if (!Number.isFinite(amount) || amount <= 0) f.amount = 'Montant invalide';
      else if (amount < cents(AFF.minWithdraw)) f.amount = 'Le retrait minimum est de ' + AFF.minWithdraw.toFixed(2).replace('.', ',') + ' $';
      else if (amount > summary.availableCents) f.amount = 'Montant supérieur à votre solde disponible';
      var bank;
      if (useSaved) bank = x.user.affiliate.bank;
      else {
        if (holder.length < 2) f.holder = 'Nom du titulaire requis';
        if (institution.length < 2) f.institution = 'Institution requise';
        if (!/^[A-Za-z0-9]{5,34}$/.test(account)) f.account = 'Numéro de compte invalide (5 à 34 caractères)';
        bank = { holder: holder, institution: institution, last4: account.slice(-4) };   // le numero complet n'est JAMAIS conserve
      }
      if (Object.keys(f).length) return fail(400, 'validation', { fields: f });

      x.user.affiliate.bank = bank;
      var w = { id: await C.randomId(), userId: x.user.id, amountCents: amount, status: 'pending', createdAt: iso(), bank: bank, note: '' };
      x.db.withdrawals.push(w); x.dirty = true;
      return ok({ ok: true, withdrawal: { id: w.id, amountCents: w.amountCents, status: w.status, createdAt: w.createdAt, bank: w.bank }, stats: affSummary(x.db, x.user.id) }, 201);
    });

    /* Demo : fait avancer un retrait en attente a "verse" (le vrai versement se fait via l'administration) */
    route('POST', '/demo/payout', async function (x) {
      if (!demoMode()) return fail(404, 'not_found');
      var d = need(x); if (d) return d;
      var w = x.db.withdrawals.find(function (z) { return z.id === x.req.body.id && z.userId === x.user.id && z.status === 'pending'; });
      if (!w) return fail(404, 'not_found');
      w.status = 'paid'; w.processedAt = iso(); w.note = 'Versement simulé (mode démonstration)'; x.dirty = true;
      return ok({ ok: true });
    });

    /* ---------- avis ---------- */
    route('GET', '/reviews', async function (x) {
      var limit = Math.min(50, Math.max(1, parseInt(x.req.query.limit, 10) || 12));
      var offset = Math.max(0, parseInt(x.req.query.offset, 10) || 0);
      var pub = x.db.reviews.filter(function (r) { return r.status === 'published'; })
        .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
      return ok({ summary: reviewSummary(x.db), total: pub.length,
        reviews: pub.slice(offset, offset + limit).map(function (r) { return reviewView(x.db, r, x.user); }),
        mine: x.user ? (function () { var r = x.db.reviews.find(function (z) { return z.userId === x.user.id; }); return r ? reviewView(x.db, r, x.user) : null; })() : null,
        canVideo: !!(M.videoSupported) });
    });

    async function readReviewBody(x, existing) {
      var b = x.req.body, f = {};
      var rating = Math.floor(Number(b.rating));
      var title = str(b.title, 80), text = str(b.body, 1500);
      if (!(rating >= 1 && rating <= 5)) f.rating = 'Choisissez une note de 1 à 5';
      if (text.length < 10) f.body = 'Racontez-nous votre expérience (10 caractères minimum)';
      var media = [], seen = {}, videos = 0;
      var items = Array.isArray(b.media) ? b.media.slice(0, 6) : [];
      for (var i = 0; i < items.length; i++) {
        var it = M.checkAttachment(x.db, x.user.id, items[i]);
        if (!it || seen[it.url]) continue;
        seen[it.url] = 1;
        if (it.type === 'video') { if (++videos > 1) continue; }
        media.push(it);
      }
      if (media.length > 5) media = media.slice(0, 5);
      if (Object.keys(f).length) return { err: fail(400, 'validation', { fields: f }) };
      return { rating: rating, title: title, body: text, media: media };
    }

    route('POST', '/reviews', async function (x) {
      var d = need(x); if (d) return d;
      if (x.db.reviews.some(function (r) { return r.userId === x.user.id; })) return fail(409, 'already_reviewed');
      var r = await readReviewBody(x); if (r.err) return r.err;
      var verified = x.db.orders.some(function (o) { return o.userId === x.user.id && o.status !== 'cancelled'; });
      var rev = { id: await C.randomId(), userId: x.user.id, rating: r.rating, title: r.title, body: r.body, media: r.media,
        verified: verified, createdAt: iso(), updatedAt: null, status: 'published' };
      x.db.reviews.push(rev); x.dirty = true;
      return ok({ review: reviewView(x.db, rev, x.user), summary: reviewSummary(x.db) }, 201);
    });

    route('PUT', '/reviews/([a-f0-9]+)', async function (x, m) {
      var d = need(x); if (d) return d;
      var rev = x.db.reviews.find(function (z) { return z.id === m[1] && z.userId === x.user.id; });
      if (!rev) return fail(404, 'not_found');
      var r = await readReviewBody(x); if (r.err) return r.err;
      rev.rating = r.rating; rev.title = r.title; rev.body = r.body; rev.media = r.media; rev.updatedAt = iso(); x.dirty = true;
      return ok({ review: reviewView(x.db, rev, x.user), summary: reviewSummary(x.db) });
    });

    route('DELETE', '/reviews/([a-f0-9]+)', async function (x, m) {
      var d = need(x); if (d) return d;
      var i = x.db.reviews.findIndex(function (z) { return z.id === m[1] && z.userId === x.user.id; });
      if (i < 0) return fail(404, 'not_found');
      x.db.reviews.splice(i, 1); x.dirty = true;
      return ok({ ok: true, summary: reviewSummary(x.db) });
    });

    /* ---------- administration ---------- */
    route('GET', '/admin/overview', async function (x) {
      var d = needAdmin(x); if (d) return d;
      var byId = {}; x.db.users.forEach(function (u) { byId[u.id] = u; });
      return ok({
        offer: offerState(x.db), demo: demoMode(), flow: FLOW,
        counts: { orders: x.db.orders.length, users: x.db.users.length, affiliates: x.db.users.filter(function (u) { return u.affiliate; }).length,
          subscribers: x.db.subscribers.length, reviews: x.db.reviews.length },
        orders: x.db.orders.slice().reverse().map(function (o) { return orderView(o, true); }),
        withdrawals: x.db.withdrawals.slice().reverse().map(function (w) {
          var u = byId[w.userId] || {};
          return { id: w.id, amountCents: w.amountCents, status: w.status, createdAt: w.createdAt, processedAt: w.processedAt || null, bank: w.bank, note: w.note || '', user: { name: (u.firstName || '') + ' ' + (u.lastName || ''), email: u.email || '', code: u.affiliate ? u.affiliate.code : '' } };
        }),
        reviews: x.db.reviews.slice().reverse().map(function (r) { return reviewView(x.db, r, null); }),
        users: x.db.users.map(function (u) { return { id: u.id, name: u.firstName + ' ' + u.lastName, email: u.email, createdAt: u.createdAt, code: u.affiliate ? u.affiliate.code : '' }; })
      });
    });

    route('POST', '/admin/orders/([A-Za-z0-9-]+)/status', async function (x, m) {
      var d = needAdmin(x); if (d) return d;
      var o = x.db.orders.find(function (z) { return z.id === m[1]; });
      if (!o) return fail(404, 'not_found');
      var st = x.req.body.status;
      if (FLOW.indexOf(st) < 0 && st !== 'cancelled') return fail(400, 'invalid_status');
      setStatus(x.db, o, st, x.req.body); x.dirty = true;
      return ok({ order: orderView(o, true) });
    });

    route('POST', '/admin/withdrawals/([a-f0-9]+)', async function (x, m) {
      var d = needAdmin(x); if (d) return d;
      var w = x.db.withdrawals.find(function (z) { return z.id === m[1]; });
      if (!w || w.status !== 'pending') return fail(404, 'not_found');
      var act = x.req.body.action;
      if (act !== 'pay' && act !== 'reject') return fail(400, 'invalid_action');
      w.status = act === 'pay' ? 'paid' : 'rejected'; w.processedAt = iso(); w.note = str(x.req.body.note, 140);
      x.dirty = true;
      return ok({ ok: true });
    });

    route('POST', '/admin/reviews/([a-f0-9]+)', async function (x, m) {
      var d = needAdmin(x); if (d) return d;
      var i = x.db.reviews.findIndex(function (z) { return z.id === m[1]; });
      if (i < 0) return fail(404, 'not_found');
      var act = x.req.body.action;
      if (act === 'delete') x.db.reviews.splice(i, 1);
      else if (act === 'hide') x.db.reviews[i].status = 'hidden';
      else if (act === 'show') x.db.reviews[i].status = 'published';
      else return fail(400, 'invalid_action');
      x.dirty = true;
      return ok({ ok: true });
    });

    route('POST', '/admin/users/([a-f0-9]+)/reset-password', async function (x, m) {
      var d = needAdmin(x); if (d) return d;
      var u = x.db.users.find(function (z) { return z.id === m[1]; });
      if (!u) return fail(404, 'not_found');
      var temp = 'Oreva-' + (await C.randomToken()).slice(0, 8);
      u.passwordHash = await C.hashPassword(temp);
      x.db.sessions = x.db.sessions.filter(function (s) { return s.userId !== u.id; });
      x.dirty = true;
      return ok({ tempPassword: temp });
    });

    /* ==========================================================
       POINT D'ENTREE
       req = { method, path ('/offer'), query, body, sid, admin, ip }
       ========================================================== */
    async function handle(db, req) {
      req.body = req.body && typeof req.body === 'object' ? req.body : {};
      req.query = req.query || {};
      var x = { db: db, req: req, user: null, dirty: false, session: null };

      if (req.sid) {
        var h = await C.sha256(req.sid), t = now();
        var s = db.sessions.find(function (z) { return z.h === h && z.exp > t; });
        if (s) x.user = db.users.find(function (u) { return u.id === s.userId; }) || null;
      }
      for (var i = 0; i < routes.length; i++) {
        var r = routes[i];
        if (r.method !== req.method) continue;
        var m = r.re.exec(req.path);
        if (!m) continue;
        var out = await r.fn(x, m);
        out.dirty = x.dirty; out.session = x.session;
        return out;
      }
      return { status: 404, body: { error: 'not_found' }, dirty: false, session: null };
    }

    return { handle: handle, emptyDb: emptyDb, fix: fix, offerState: offerState, STATUS_LABEL: STATUS_LABEL, FLOW: FLOW };
  }

  return { create: create, STATUS_LABEL: STATUS_LABEL, FLOW: FLOW };
});
