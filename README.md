# Oreva

Boutique en ligne à un seul produit (Bright Boost Gel Cream) : offre -15 % pour les 50 premiers clients, comptes clients, suivi de commande, programme d'affiliation, retraits et avis avec photos/vidéos.

Site statique (HTML/CSS/JS) + petit serveur Node.js **sans dépendance**.

## Lancer en local

```bash
node server.js          # Node 18+
# http://localhost:3000        le site
# http://localhost:3000/admin.html   l'administration
```

Variables d'environnement : `PORT`, `ADMIN_KEY` (clé admin ; sinon une clé temporaire s'affiche dans la console), `COOKIE_SECURE=1` (derrière HTTPS), `DATA_DIR` (dossier des données, par défaut `./data`).

## Configuration

Tout se règle dans `public/config.js` (prix, offre, livraison, commission d'affiliation, enseignes du bandeau). Les lignes marquées `>>> A VERIFIER` sont des valeurs de départ à remplacer.

## Hébergement : important

- **GitHub Pages** n'héberge que des fichiers statiques : le site s'y affiche en *mode démonstration* (comptes, commandes et gains restent dans le navigateur du visiteur ; la limite des 50 rabais n'est **pas réelle**). Utile pour montrer le design, pas pour vendre.
- Pour de vrais comptes et une vraie limite, hébergez `server.js` sur un service Node (Render, Railway, Fly.io, un VPS…) avec un disque persistant pour `data/`, en HTTPS.

## Fictif tant que non branché

Paiement (mode test), virements aux affiliés (à faire manuellement puis « Marquer versé »), courriels automatiques. Voir `LISEZ-MOI.txt`.

## Sécurité

`data/` (comptes, commandes, fichiers téléversés) est exclu par `.gitignore` : ne le publiez jamais. Ne mettez aucune clé dans le dépôt.
