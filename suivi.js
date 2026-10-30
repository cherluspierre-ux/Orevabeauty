/* OREVA - suivi public d'une commande (numero + courriel) */
(function () {
  'use strict';
  var O = window.OREVA, $ = O.$, esc = O.esc, money = O.money;
  var form = $('#trackForm'), out = $('#trackResult');
  var q = new URLSearchParams(location.search);
  if (q.get('order')) form.elements.orderId.value = q.get('order');

  function err(n, m) { var e = $('[data-err="' + n + '"]', form); e.textContent = m || ''; e.closest('.field').classList.toggle('has-error', !!m); }
  form.addEventListener('submit', function (e) {
    e.preventDefault(); err('orderId'); err('email'); $('[data-alert]', form).hidden = true; out.hidden = true;
    var id = form.elements.orderId.value.trim(), em = form.elements.email.value.trim();
    if (!id) return err('orderId', 'Entrez votre numéro de commande');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) return err('email', 'Entrez le courriel utilisé à la commande');
    var b = $('button[type=submit]', form); b.disabled = true; b.classList.add('is-loading');
    O.api('POST', '/track', { orderId: id, email: em }).then(function (r) {
      b.disabled = false; b.classList.remove('is-loading');
      if (r.status === 429) { var a = $('[data-alert]', form); a.hidden = false; a.textContent = 'Trop de tentatives. Patientez une minute.'; return; }
      if (r.status !== 200) { var a2 = $('[data-alert]', form); a2.hidden = false; a2.textContent = 'Aucune commande ne correspond à ce numéro et à ce courriel. Vérifiez-les puis réessayez.'; return; }
      var o = r.data.order;
      out.hidden = false;
      out.innerHTML = '<header class="order-head"><div><b>' + esc(o.id) + '</b><span>' + esc(O.fmtDate(o.createdAt)) + '</span></div>' +
        '<span class="pill pill-' + ({ delivered: 'ok', cancelled: 'bad', shipped: 'warn' }[o.status] || 'info') + '">' + esc(O.STATUS[o.status]) + '</span>' +
        '<strong class="order-total">' + money(o.pricing.total) + '</strong></header><div class="order-body"><div class="order-track">' + O.trackingHtml(o) + '</div></div>';
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function () { b.disabled = false; b.classList.remove('is-loading'); var a = $('[data-alert]', form); a.hidden = false; a.textContent = 'Connexion impossible. Réessayez.'; });
  });
})();
