/* ==========================================================
   OREVA - page de paiement (checkout.html)
   ========================================================== */
(function () {
  'use strict';

  var OREVA = window.OREVA;
  var CONFIG = OREVA.CONFIG, compute = OREVA.compute, unitPrice = OREVA.unitPrice;
  var Cart = OREVA.Cart, Offer = OREVA.Offer, money = OREVA.money, esc = OREVA.esc, icon = OREVA.icon, $ = OREVA.$, $$ = OREVA.$$;
  var api = OREVA.api, Auth = OREVA.Auth, Ref = OREVA.Ref;
  var TEST = CONFIG.payment.mode === 'demo';
  var P = CONFIG.product, O = CONFIG.offer;

  var form = $('#checkoutForm'), payBtn = $('#payBtn'), alertBox = $('#coAlert');
  var qs = new URLSearchParams(location.search);

  /* Arrivee depuis la banniere : on met 1 pot dans le panier si le panier est vide */
  if (qs.get('qty') && Cart.qty() === 0) {
    var q = parseInt(qs.get('qty'), 10);
    if (q > 0) Cart.set(q);
  }

  var state = { done: false };

  function on() { return OREVA.offerOn(); }

  /* ---------- rendu du resume de commande ---------- */
  function renderSummary() {
    var qty = Cart.qty();
    $('#coEmpty').hidden = qty > 0;
    $('#coContent').hidden = qty === 0;
    if (!qty) return;

    var c = compute(qty, on());
    var unitNow = unitPrice(on());

    $('#sumLines').innerHTML =
      '<div class="sum-line">' +
      '<div class="sum-thumb"><img src="' + P.image + '" alt=""><span class="sum-qty">' + qty + '</span></div>' +
      '<div class="sum-info"><strong>' + esc(P.name) + '</strong><span class="muted">' + esc(P.brand) + ' · ' + esc(P.size) + '</span>' +
      '<div class="stepper stepper-sm" role="group" aria-label="Quantité">' +
      '<button type="button" data-co-dec aria-label="Retirer un">' + icon('minus') + '</button><output>' + qty + '</output>' +
      '<button type="button" data-co-inc aria-label="Ajouter un"' + (qty >= P.maxQty ? ' disabled' : '') + '>' + icon('plus') + '</button></div></div>' +
      '<div class="sum-price">' + (on() ? '<s>' + money(P.price * qty) + '</s>' : '') + '<b>' + money(unitNow * qty) + '</b></div></div>';

    $('#sumTotals').innerHTML =
      '<div><dt>Sous-total</dt><dd>' + money(c.subtotal) + '</dd></div>' +
      (c.discount ? '<div class="t-offer"><dt>Offre 50 premiers clients (−' + O.percent + '&nbsp;%)</dt><dd>−' + money(c.discount) + '</dd></div>' : '') +
      '<div><dt>Livraison</dt><dd>' + (c.freeShipping ? 'Offerte' : money(c.shipping)) + '</dd></div>' +
      (c.tax ? '<div><dt>Taxes</dt><dd>' + money(c.tax) + '</dd></div>' : '') +
      '<div class="t-total"><dt>Total</dt><dd><small>' + CONFIG.currency + '</small> ' + money(c.total) + '</dd></div>';

    $('#shipPrice').textContent = c.freeShipping ? 'Offerte' : money(c.shipping);
    payBtn.querySelector('.pay-label').textContent = (TEST ? 'Payer (mode test)' : 'Payer') + ' · ' + money(c.total);

    // notice d'offre (haut du formulaire + resume)
    var box = $('#coOffer');
    if (!Offer.loaded) { box.className = 'co-offer is-loading'; box.innerHTML = '<span>Vérification de l\'offre…</span>'; return; }
    if (on()) {
      var pct = Math.min(100, Offer.used / Offer.limit * 100);
      box.className = 'co-offer is-on';
      box.innerHTML = icon('bolt') +
        '<div><strong>Offre de lancement appliquée : −' + O.percent + '&nbsp;%</strong>' +
        '<span>Réservée aux ' + Offer.limit + ' premiers clients · plus que <b>' + Offer.remaining + '</b> disponibles</span>' +
        '<div class="bar"><i style="width:' + pct + '%"></i></div></div>';
    } else if (OREVA.offerDenied && Offer.active) {
      box.className = 'co-offer is-off';
      box.innerHTML = icon('shield') + '<div><strong>Offre non applicable</strong><span>Le rabais est limité à une commande par client.</span></div>';
    } else {
      box.className = 'co-offer is-off';
      box.innerHTML = icon('shield') + '<div><strong>L\'offre de lancement est terminée</strong><span>Les ' + Offer.limit + ' rabais ont été réclamés. Merci de votre intérêt !</span></div>';
    }
  }

  document.addEventListener('oreva:cart', renderSummary);
  document.addEventListener('oreva:offer', renderSummary);
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-co-inc],[data-co-dec]') : null;
    if (!b) return;
    Cart.set(Cart.qty() + (b.hasAttribute('data-co-inc') ? 1 : -1));
  });

  /* ---------- validation ---------- */
  var RULES = {
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Entrez un courriel valide (ex. nom@domaine.com)'; },
    firstName: function (v) { return v ? '' : 'Entrez votre prénom'; },
    lastName: function (v) { return v ? '' : 'Entrez votre nom'; },
    address: function (v) { return v.length >= 4 ? '' : 'Entrez votre adresse'; },
    city: function (v) { return v ? '' : 'Entrez votre ville'; },
    region: function (v) { return v ? '' : 'Entrez votre province ou état'; },
    postal: function (v) { return v.length >= 3 ? '' : 'Entrez votre code postal'; },
    country: function (v) { return v ? '' : 'Choisissez un pays'; },
    phone: function (v) { return !v || v.replace(/\D/g, '').length >= 7 ? '' : 'Numéro de téléphone invalide'; }
  };

  /* ---------- carte de TEST (jamais envoyee ni conservee : seulement la marque et les 4 derniers chiffres) ---------- */
  var TEST_CARDS = ['4242424242424242', '4000000000000002'];
  function luhn(num) {
    var sum = 0, alt = false;
    for (var i = num.length - 1; i >= 0; i--) { var n = parseInt(num.charAt(i), 10); if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
    return sum % 10 === 0;
  }
  function cardBrand(num) { return /^4/.test(num) ? 'Visa' : /^(5[1-5]|2[2-7])/.test(num) ? 'Mastercard' : /^3[47]/.test(num) ? 'Amex' : 'Carte'; }
  if (TEST) {
    RULES.card = function (v) {
      var n = v.replace(/\D/g, '');
      if (n.length < 13) return 'Entrez le numéro de carte de test';
      if (!luhn(n)) return 'Numéro de carte invalide';
      if (TEST_CARDS.indexOf(n) < 0) return 'Mode test : utilisez la carte 4242 4242 4242 4242. N\'entrez jamais une vraie carte.';
      return '';
    };
    RULES.exp = function (v) {
      var m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(v); if (!m) return 'Format MM/AA';
      var now = new Date(), y = 2000 + parseInt(m[2], 10), mo = parseInt(m[1], 10);
      return (y > now.getFullYear() || (y === now.getFullYear() && mo >= now.getMonth() + 1)) ? '' : 'Carte expirée';
    };
    RULES.cvc = function (v) { return /^\d{3,4}$/.test(v) ? '' : '3 ou 4 chiffres'; };
    $('#payDemo').hidden = false;
    var fc = $('#f-card'), fe = $('#f-exp');
    fc.addEventListener('input', function () { var d = fc.value.replace(/\D/g, '').slice(0, 19); fc.value = d.replace(/(.{4})/g, '$1 ').trim(); });
    fe.addEventListener('input', function () { var d = fe.value.replace(/\D/g, '').slice(0, 4); fe.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; });
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('[data-fill-card]')) return;
      var y = (new Date().getFullYear() + 3) % 100;
      fc.value = '4242 4242 4242 4242'; fe.value = '12/' + (y < 10 ? '0' + y : y); $('#f-cvc').value = '123';
      ['card', 'exp', 'cvc'].forEach(function (n) { setError(form.elements[n], ''); });
    });
  } else { $('#payLive').hidden = false; }

  /* ---------- compte : pre-remplissage + rappel de connexion ---------- */
  var prefilled = false;
  function renderAccount() {
    var box = $('#coAccount'), u = Auth.user;
    if (!Auth.loaded) return;
    box.hidden = false;
    if (u) {
      box.innerHTML = OREVA.avatarHtml(u, 40) + '<div><b>Connecté(e) : ' + esc(u.firstName + ' ' + u.lastName) + '</b><span>Cette commande apparaîtra dans votre compte.</span></div>' +
        '<button class="link-btn" type="button" data-logout>Changer de compte</button>';
      var em = form.elements.email;
      if (!prefilled) {
        prefilled = true;
        if (!em.value) em.value = u.email;
        if (!form.elements.firstName.value) form.elements.firstName.value = u.firstName;
        if (!form.elements.lastName.value) form.elements.lastName.value = u.lastName;
        api('GET', '/orders').then(function (r) {                    // reprend la derniere adresse utilisee
          var last = r.status === 200 && r.data.orders[0]; if (!last) return;
          ['address', 'address2', 'city', 'region', 'postal', 'phone'].forEach(function (k) { var el = form.elements[k]; if (el && !el.value) el.value = last.customer[k] || ''; });
          if (last.customer.country) form.elements.country.value = last.customer.country;
        });
      }
    } else {
      box.innerHTML = icon('user') + '<div><b>Vous avez un compte ?</b><span>Connectez-vous pour suivre votre commande et retrouver vos informations.</span></div>' +
        '<a class="btn btn-ghost-dark" href="compte.html?next=checkout.html">Se connecter</a>';
    }
  }
  document.addEventListener('oreva:auth', renderAccount);

  /* ---------- code de parrainage ---------- */
  function renderRef() {
    var code = Ref.get(), p = $('#coRef');
    if (!code) { p.hidden = true; return; }
    p.hidden = false;
    p.innerHTML = icon('check') + ' Recommandé par le code <b>' + esc(code) + '</b> <button class="link-btn" type="button" data-ref-clear>Retirer</button>';
  }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-ref-clear]')) { Ref.clear(); renderRef(); } });
  document.addEventListener('oreva:ref', renderRef);
  renderRef();

  function fieldWrap(el) { return el.closest('.field'); }
  function setError(el, msg) {
    var w = fieldWrap(el); if (!w) return;
    var err = $('.err', w);
    if (msg) { w.classList.add('has-error'); el.setAttribute('aria-invalid', 'true'); if (err) err.textContent = msg; }
    else { w.classList.remove('has-error'); el.removeAttribute('aria-invalid'); if (err) err.textContent = ''; }
  }
  function checkField(el) {
    var rule = RULES[el.name]; if (!rule) return true;
    var msg = rule(el.value.trim()); setError(el, msg); return !msg;
  }
  $$('input, select', form).forEach(function (el) {
    if (!RULES[el.name]) return;
    el.addEventListener('blur', function () { checkField(el); });
    el.addEventListener('input', function () { if (fieldWrap(el).classList.contains('has-error')) checkField(el); });
  });

  function showAlert(html, kind) {
    alertBox.hidden = false; alertBox.className = 'co-alert ' + (kind || 'bad'); alertBox.innerHTML = html;
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function hideAlert() { alertBox.hidden = true; }

  form.elements.terms.addEventListener('change', function () { if (this.checked) $('#termsErr').textContent = ''; });

  /* ---------- envoi ---------- */
  function customerData() {
    var d = {}; ['email', 'firstName', 'lastName', 'address', 'address2', 'city', 'region', 'postal', 'country', 'phone'].forEach(function (n) {
      var el = form.elements[n]; d[n] = el ? el.value.trim() : '';
    });
    return d;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault(); hideAlert();
    var first = null;
    $$('input, select', form).forEach(function (el) { if (RULES[el.name] && !checkField(el) && !first) first = el; });
    var terms = form.elements.terms;
    if (!terms.checked) {
      $('#termsErr').textContent = 'Veuillez accepter les conditions de vente pour continuer.';
      if (!first) first = terms;
    } else { $('#termsErr').textContent = ''; }
    if (first) { first.focus(); return; }

    var qty = Cart.qty(); if (!qty) return;
    var pricing = compute(qty, on());
    var payload = {
      qty: qty, termsAccepted: true,
      expectedTotalCents: Math.round(pricing.total * 100),
      customer: customerData(), ref: Ref.get() || undefined
    };
    if (TEST) {
      var num = form.elements.card.value.replace(/\D/g, '');
      payload.payment = { method: 'test-card', brand: cardBrand(num), last4: num.slice(-4) };
    }
    place(payload, pricing);
  });

  function setLoading(v) {
    payBtn.disabled = v; payBtn.classList.toggle('is-loading', v);
  }

  function place(payload, pricing) {
    setLoading(true);
    api('POST', '/order', payload).then(function (res) {
      var d = res.data;
      if (res.status === 201) return success(d.orderId, d.pricing, d.discounted, TEST, payload.payment);
      if (res.status === 402) {
        showAlert('<strong>Paiement refusé.</strong> Cette carte de test a été refusée, comme le ferait une vraie banque. Utilisez <b>4242 4242 4242 4242</b> pour réussir.', 'bad');
        return setLoading(false);
      }
      if (res.status === 409 && d.error === 'total_changed') {
        if (d.reason === 'offer_already_used') OREVA.offerDenied = true;
        return Offer.refresh().then(function () {
          renderSummary();
          var why = d.reason === 'offer_already_used'
            ? 'Le rabais de lancement est limité à une commande par client : il a déjà été utilisé avec ce courriel.'
            : 'L\'offre de lancement vient de se terminer : les ' + Offer.limit + ' rabais ont été réclamés.';
          showAlert('<strong>Le total a changé.</strong> ' + why + ' Nouveau total : <b>' + money(d.pricing.total) + '</b>. Vérifiez puis confirmez à nouveau.', 'warn');
          setLoading(false);
        });
      }
      if (res.status === 400 && d.fields) {
        Object.keys(d.fields).forEach(function (k) { var el = form.elements[k]; if (el) setError(el, d.fields[k]); });
        showAlert('Certaines informations sont invalides. Corrigez les champs indiqués.', 'bad'); return setLoading(false);
      }
      if (res.status === 429) { showAlert('Trop de tentatives. Patientez une minute puis réessayez.', 'bad'); return setLoading(false); }
      if (res.status === 507) { showAlert('Espace de stockage plein dans ce navigateur (mode démonstration).', 'bad'); return setLoading(false); }
      throw new Error('order failed');
    }).catch(function () {
      showAlert('Une erreur est survenue. Votre commande n\'a pas été passée, réessayez dans un instant.', 'bad'); setLoading(false);
    });
  }

  function success(orderId, pricing, discounted, demo, payment) {
    state.done = true;
    var cust = customerData();
    Cart.clear();
    $('#checkoutPage').hidden = true;
    var s = $('#success'); s.hidden = false;
    $('#okName').textContent = cust.firstName;
    $('#okOrder').textContent = orderId;
    $('#okTotal').textContent = money(pricing.total) + (payment ? ' · ' + payment.brand + ' •••• ' + payment.last4 : '');
    $('#okAddr').textContent = cust.address + ', ' + cust.city + ' ' + cust.postal;
    $('#okDiscount').hidden = !discounted;
    $('#okDemo').hidden = !demo;
    var loggedIn = !!Auth.user;
    $('#okAccountIn').hidden = !loggedIn; $('#okAccountOut').hidden = loggedIn;
    $('#okTrackOut').href = 'suivi.html?order=' + encodeURIComponent(orderId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setLoading(false);
  }

  /* ---------- demarrage ---------- */
  renderSummary(); renderAccount();
  document.addEventListener('oreva:offer', function () { if (!state.done) renderSummary(); });
})();
