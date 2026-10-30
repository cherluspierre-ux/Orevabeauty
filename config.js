/* ==========================================================
   OREVA - CONFIGURATION (le seul fichier a modifier)
   Ce fichier est lu par le site ET par le serveur (server.js),
   donc les prix et l'offre sont toujours identiques des deux cotes.
   Les lignes marquees  >>> A VERIFIER  sont des valeurs de depart.
   ========================================================== */
(function (root) {
  'use strict';

  var CONFIG = {
    shop: {
      name: 'Oreva',
      email: 'contact@exemple.com',          // >>> A VERIFIER : ton vrai courriel de contact
      legalName: 'Oreva',                    // >>> A VERIFIER : nom legal / adresse de l'entreprise
      address: ''                            // >>> A VERIFIER : adresse (affichee dans les infos legales si remplie)
    },

    product: {
      id: 'bright-boost-gel-cream',
      brand: 'Neutrogena',
      name: 'Bright Boost Gel Cream',
      size: '50 g',                          // >>> A VERIFIER : format inscrit sur ton emballage
      price: 27.99,                          // >>> A VERIFIER : ton prix regulier en $
      image: 'img/pot.png',
      maxQty: 5                              // quantite maximale par commande
    },

    currency: 'CAD',                         // 'CAD', 'USD', 'EUR'...
    locale: 'fr-CA',

    /* Offre de lancement : -15 % pour les 50 premiers clients */
    offer: {
      code: 'PREMIERS50',
      limit: 50,                             // nombre de clients qui en profitent
      percent: 15,                           // rabais en %
      oncePerCustomer: true                  // 1 rabais par courriel
    },

    shipping: {
      freeOver: 50,                          // >>> A VERIFIER : livraison offerte des X $ (avant rabais)
      flatRate: 6.99,                        // >>> A VERIFIER : frais sinon
      minDays: 3,                            // >>> A VERIFIER : delai de livraison (jours ouvrables)
      maxDays: 7,
      carrier: 'Postes Canada'               // >>> A VERIFIER : transporteur affiche dans le suivi
    },

    returns: { days: 30 },                   // >>> A VERIFIER : politique de retour reelle

    taxRate: 0,                              // ex: 0.14975 pour TPS+TVQ. 0 = aucune ligne de taxe affichee

    payment: {
      mode: 'demo'                           // 'demo' = aucun paiement reel. Voir le guide pour brancher Stripe.
    },

    /* Programme d'affiliation */
    affiliate: {
      percent: 10,                           // >>> A VERIFIER : commission en % du montant (apres rabais, sans livraison)
      minWithdraw: 25,                       // retrait minimum en $
      cookieDays: 30                         // duree pendant laquelle un lien de parrainage est retenu
    },

    /* Bandeau defilant "Disponible chez" : mets ICI uniquement les enseignes qui vendent
       reellement ton produit ou avec lesquelles tu as une entente ecrite. Vide = bandeau cache.
       Exemple : { name: 'Nom de l'enseigne', logo: 'img/partners/nom.svg', url: 'https://...' }
       (sans "logo", le nom s'affiche en texte) */
    partners: {
      title: 'Disponible chez',
      items: []
    }
  };

  function round2(n) { return Math.round(n * 100) / 100; }

  /* Prix unitaire affiche (avec ou sans l'offre) */
  function unitPrice(offerOn) {
    var p = CONFIG.product.price;
    return offerOn ? round2(p - round2(p * CONFIG.offer.percent / 100)) : p;
  }

  /* Calcul du total - utilise par le site et par le serveur */
  function compute(qty, offerOn) {
    qty = Math.max(0, Math.floor(qty) || 0);
    var subtotal = round2(CONFIG.product.price * qty);
    var discount = offerOn ? round2(subtotal * CONFIG.offer.percent / 100) : 0;
    var after = round2(subtotal - discount);
    var shipping = qty === 0 ? 0 : (subtotal >= CONFIG.shipping.freeOver ? 0 : CONFIG.shipping.flatRate);
    var tax = round2((after + shipping) * CONFIG.taxRate);
    var total = round2(after + shipping + tax);
    return {
      qty: qty, unit: CONFIG.product.price, subtotal: subtotal, discount: discount,
      shipping: shipping, tax: tax, total: total, freeShipping: shipping === 0 && qty > 0
    };
  }

  root.OREVA = { CONFIG: CONFIG, compute: compute, unitPrice: unitPrice, round2: round2 };
})(typeof window !== 'undefined' ? window : globalThis);
