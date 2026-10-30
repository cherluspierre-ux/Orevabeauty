/* OREVA - administration (commandes, retraits, avis, clients) */
(function () {
  'use strict';
  var O = window.OREVA, $ = O.$, $$ = O.$$, esc = O.esc, money = O.money, cents = O.cents, api = O.api;
  var data = null, tab = 'orders', KEY = 'oreva_admin_key';

  function load() {
    return api('GET', '/admin/overview').then(function (r) {
      if (r.status !== 200) return false;
      data = r.data; return true;
    });
  }
  function start() {
    $('#adminLogin').hidden = true; $('#adminApp').hidden = false;
    $('#adminSub').textContent = O.mode === 'demo' ? 'Mode démonstration : données de ce navigateur.' : 'Données du serveur.';
    render();
  }
  function init() {
    if (O.mode === 'server') { try { O.adminKey = sessionStorage.getItem(KEY) || ''; } catch (e) { /* rien */ } }
    load().then(function (ok) { if (ok) start(); else { $('#adminLogin').hidden = false; $('#adminApp').hidden = true; } });
  }
  O.ready.then(init);

  $('#keyForm').addEventListener('submit', function (e) {
    e.preventDefault(); O.adminKey = $('#a-key').value.trim();
    load().then(function (ok) {
      if (!ok) { $('#keyErr').textContent = 'Clé incorrecte (ou administration indisponible).'; return; }
      try { sessionStorage.setItem(KEY, O.adminKey); } catch (e2) { /* rien */ }
      start();
    });
  });
  $('#adminOut').addEventListener('click', function () { O.adminKey = ''; try { sessionStorage.removeItem(KEY); } catch (e) { /* rien */ } location.reload(); });

  function refresh() { load().then(render); }
  function render() {
    var c = data.counts;
    $('#adminStats').innerHTML = [['Commandes', c.orders], ['Clients', c.users], ['Affiliés', c.affiliates], ['Avis', c.reviews],
      ['Rabais utilisés', data.offer.used + '/' + data.offer.limit], ['Abonnés', c.subscribers]]
      .map(function (s) { return '<div class="stat"><span>' + s[0] + '</span><b>' + s[1] + '</b></div>'; }).join('');
    var pendingW = data.withdrawals.filter(function (w) { return w.status === 'pending'; }).length;
    var tabs = [['orders', 'Commandes'], ['withdrawals', 'Retraits' + (pendingW ? ' (' + pendingW + ')' : '')], ['reviews', 'Avis'], ['users', 'Clients']];
    $('#adminTabs').innerHTML = tabs.map(function (t) { return '<button type="button" data-tab="' + t[0] + '"' + (t[0] === tab ? ' aria-current="page"' : '') + '>' + t[1] + '</button>'; }).join('');
    var fn = { orders: orders, withdrawals: withdrawals, reviews: reviews, users: users }[tab];
    $('#adminPanel').innerHTML = '<div class="table-card">' + fn() + '</div>';
  }
  function orders() {
    if (!data.orders.length) return '<p class="muted">Aucune commande.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>Commande</th><th>Client</th><th class="num">Total</th><th>Statut</th><th>Suivi</th></tr></thead><tbody>' + data.orders.map(function (o) {
      var opts = ['received', 'preparing', 'shipped', 'delivered', 'cancelled'].map(function (s) { return '<option value="' + s + '"' + (s === o.status ? ' selected' : '') + '>' + O.STATUS[s] + '</option>'; }).join('');
      return '<tr data-order="' + esc(o.id) + '"><td><b>' + esc(o.id) + '</b><br><small>' + esc(O.fmtDate(o.createdAt)) + '</small></td>' +
        '<td>' + esc(o.customer.firstName + ' ' + o.customer.lastName) + '<br><small>' + esc(o.customer.email) + '<br>' + esc(o.customer.address + ', ' + o.customer.city + ' ' + o.customer.postal) + '</small>' + (o.ref ? '<br><small>Code : ' + esc(o.ref) + '</small>' : '') + '</td>' +
        '<td class="num">' + money(o.pricing.total) + '<br><small>' + o.qty + ' pot' + (o.qty > 1 ? 's' : '') + '</small></td>' +
        '<td><select data-st>' + opts + '</select></td>' +
        '<td><input data-track placeholder="N° de suivi" value="' + esc(o.tracking ? o.tracking.number : '') + '"><button class="btn btn-primary" type="button" data-save-order>Enregistrer</button></td></tr>';
    }).join('') + '</tbody></table></div><p class="muted small">Passer à « Expédiée » enregistre le numéro de suivi (généré si vide). « Livrée » rend les commissions d\'affiliation disponibles.</p>';
  }
  function withdrawals() {
    if (!data.withdrawals.length) return '<p class="muted">Aucune demande de retrait.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Affilié(e)</th><th class="num">Montant</th><th>Compte</th><th>Statut</th></tr></thead><tbody>' + data.withdrawals.map(function (w) {
      return '<tr><td>' + esc(O.fmtDate(w.createdAt)) + '</td><td>' + esc(w.user.name) + '<br><small>' + esc(w.user.email) + '</small></td><td class="num"><b>' + cents(w.amountCents) + '</b></td>' +
        '<td>' + esc(w.bank.holder) + '<br><small>' + esc(w.bank.institution) + ' •••• ' + esc(w.bank.last4) + '</small></td>' +
        '<td>' + (w.status === 'pending' ? '<button class="btn btn-primary" type="button" data-w="' + w.id + '" data-act="pay">Marquer versé</button> <button class="btn btn-ghost-dark" type="button" data-w="' + w.id + '" data-act="reject">Refuser</button>' : '<span class="pill pill-' + (w.status === 'paid' ? 'ok' : 'bad') + '">' + (w.status === 'paid' ? 'Versé' : 'Refusé') + '</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div><p class="muted small">Le site ne conserve que les 4 derniers chiffres du compte. Effectuez le virement réel via votre banque ou un prestataire (Stripe Connect, PayPal Payouts…), puis marquez « versé ».</p>';
  }
  function reviews() {
    if (!data.reviews.length) return '<p class="muted">Aucun avis.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>Client</th><th>Note</th><th>Avis</th><th></th></tr></thead><tbody>' + data.reviews.map(function (r) {
      return '<tr><td>' + esc(r.name) + '<br><small>' + esc(O.fmtDate(r.createdAt)) + (r.verified ? ' · achat vérifié' : '') + '</small></td><td>' + r.rating + '/5</td><td>' + esc(r.title ? r.title + ' — ' : '') + esc(r.body.slice(0, 160)) + (r.media.length ? '<br><small>' + r.media.length + ' fichier(s)</small>' : '') + '</td>' +
        '<td><button class="btn btn-ghost-dark" type="button" data-r="' + r.id + '" data-act="' + (r.status === 'hidden' ? 'show' : 'hide') + '">' + (r.status === 'hidden' ? 'Republier' : 'Masquer') + '</button> <button class="btn btn-ghost-dark is-danger" type="button" data-r="' + r.id + '" data-act="delete">Supprimer</button></td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function users() {
    return '<div class="table-wrap"><table><thead><tr><th>Client</th><th>Inscrit</th><th>Code affilié</th><th></th></tr></thead><tbody>' + data.users.map(function (u) {
      return '<tr><td>' + esc(u.name) + '<br><small>' + esc(u.email) + '</small></td><td>' + esc(O.fmtDate(u.createdAt)) + '</td><td>' + esc(u.code || '—') + '</td><td><button class="btn btn-ghost-dark" type="button" data-reset="' + u.id + '">Mot de passe temporaire</button></td></tr>';
    }).join('') + '</tbody></table></div><div id="resetOut"></div>';
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button') : null; if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; render(); }
    else if (t.matches('[data-save-order]')) {
      var tr = t.closest('tr');
      api('POST', '/admin/orders/' + tr.dataset.order + '/status', { status: $('[data-st]', tr).value, trackingNumber: $('[data-track]', tr).value }).then(function (r) { O.toast(r.status === 200 ? 'Commande mise à jour' : 'Erreur'); refresh(); });
    } else if (t.dataset.w) {
      api('POST', '/admin/withdrawals/' + t.dataset.w, { action: t.dataset.act }).then(function () { O.toast('Retrait mis à jour'); refresh(); });
    } else if (t.dataset.r) {
      if (t.dataset.act === 'delete' && !window.confirm('Supprimer cet avis ?')) return;
      api('POST', '/admin/reviews/' + t.dataset.r, { action: t.dataset.act }).then(function () { O.toast('Avis mis à jour'); refresh(); });
    } else if (t.dataset.reset) {
      api('POST', '/admin/users/' + t.dataset.reset + '/reset-password', {}).then(function (r) {
        if (r.status === 200) $('#resetOut').innerHTML = '<p class="demo-note">Mot de passe temporaire : <code>' + esc(r.data.tempPassword) + '</code>. Transmettez-le au client, qui pourra le changer dans son profil.</p>';
      });
    }
  });
})();
