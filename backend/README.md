# API Covoiturage — socle back-end MVP (phase 1)

API principale du cahier des charges (sections 13 et 14) : NestJS 11 / TypeScript, PostgreSQL 16, TypeORM.
Une seule API versionnée (`/api/v1`) sert l'application passager/conducteur et le back-office (`/api/v1/admin`).

## Lancer

```bash
npm ci
cp .env.example .env              # puis renseigner DATABASE_URL
npm run migration:run             # ou laisser DB_RUN_MIGRATIONS=true au démarrage
npm run start:dev                 # http://localhost:3000/api/v1, Swagger sur /api/docs
```

En développement, le fournisseur SMS `console` écrit les codes OTP dans les journaux (interdit en production).
Pour donner un rôle du personnel à un compte : `UPDATE users SET "staffRoles" = '{admin}' WHERE phone = '+213…';`
puis se reconnecter (les rôles sont portés par le jeton).

## Tests

```bash
npm run typecheck
npm test                          # tests unitaires (plafond, matching, masquage, téléphone, configuration)
TEST_DATABASE_URL=postgres://… npm run test:e2e   # bout en bout sur une vraie base (schéma recréé par les migrations)
```

Les tests de bout en bout (`test/acceptance.e2e-spec.ts`) démontrent les critères d'acceptation 18.5 du
cahier des charges qui relèvent de l'API : 1 (parcours complet), 2 (KYC et badge), 3 (plafond, y compris
en base), 4 (étanchéité « Entre femmes »), 5 et 11 (suivi, lien de partage sans compte, SOS), 6 (code de
prise en charge journalisé), 7 (messagerie masquée, aucun numéro exposé), 8 (grand livre équilibré,
rapprochement sans écart). Ils couvrent aussi la surréservation concurrente, l'expiration des demandes,
les annulations, la suspension, le blocage mutuel et la suppression de compte.

Contrat d'API : [`openapi.json`](openapi.json), régénéré par `npm run openapi:export`.

## Organisation

```
src/
  common/            erreurs normalisées, garde JWT et rôles, pagination par curseur, utilitaires
                     (plafond de prix, géométrie, masquage des coordonnées, téléphone algérien)
  modules/
    auth/            OTP SMS (limites de tentatives et de renvois), jetons d'accès + renouvellement avec rotation
    users/           profil, contacts d'urgence, charte conducteur, blocage mutuel, suppression (anonymisation)
    kyc/             dépôt des pièces, file de revue, niveaux de confiance 0-2, expirations (J-30, J-7)
    vehicles/        véhicules, validation par la carte grise, plaque masquée
    geo/             référentiel des wilayas (FR/AR), fournisseur de cartographie (interface + repli)
    settings/        paramètres métier versionnés et paramètres de prix par axe
    trips/           publication sous plafond, recherche par corridor, réservations, exécution du trajet, alertes
    ledger/          grand livre en partie double, portefeuille, séquestre, commissions, rapprochement
    messaging/       fil par réservation, masquage des numéros, e-mails et liens
    reviews/         notation réciproque, modération
    safety/          positions, suivi en direct, liens de partage, SOS, signalements
    notifications/   notifications dans l'application, SMS avec bascule entre passerelles
    audit/           journal d'audit en ajout seul
    admin/           back-office : KYC, utilisateurs, paramètres, prix, finance, incidents, modération
  migrations/        schéma de base (TypeORM)
```

### Règles métier garanties par la base

- `trips.pricePerSeat <= trips.priceCap` et cohérence du compteur de places : contraintes `CHECK`.
- Réservation : verrou sur le trajet puis décrément atomique des places ; ordre de verrouillage
  trajet → réservation partout, pour éviter les interblocages.
- `audit_logs`, `ledger_entries`, `ledger_transactions` : trigger qui refuse `UPDATE` et `DELETE`.
- Soldes jamais stockés : dérivés des écritures. Toute opération d'argent porte une clé d'idempotence.

### Choix à connaître

- **Statuts de réservation** : `pending → confirmed → in_progress → completed`, sorties `refused`,
  `cancelled_by_passenger`, `cancelled_by_driver`, `expired`, `no_show`. L'état « acceptée » du cahier
  des charges est confondu avec « confirmée » : l'acceptation garantit le paiement dans la même transaction.
- **Démarrage** : le conducteur « démarre » le trajet, puis chaque passager n'est à bord qu'après saisie
  de son code ; le trajet ne peut être clos que lorsque chaque passager est pris en charge ou déclaré absent.
- **Matching par corridor** calculé en mémoire sur les trajets du jour (500 candidats au plus) ; à passer
  sur PostGIS quand le volume l'exigera. Le fournisseur de cartographie par défaut estime la distance à vol
  d'oiseau × coefficient routier paramétrable : à remplacer par le fournisseur retenu en phase 0.
- **Paiement en espèces** : commission débitée du portefeuille du conducteur à la fin du trajet ; publication
  bloquée sous un seuil de solde. Les frais d'annulation tardive ne sont prélevés que sur les paiements par
  portefeuille (en espèces, seul le score de fiabilité baisse).
- **Modification d'un trajet réservé** : prix et places modifiables sous plafond (les réservations gardent
  leur prix) ; la date ne change qu'en l'absence de réservation, sinon il faut annuler.
- Tous les seuils (OTP, rayon de corridor, délais, frais, commission, fenêtres) sont des paramètres versionnés
  modifiables par `PUT /api/v1/admin/settings/:key`, jamais codés en dur.

## Reste à faire pour la phase 1

Non couvert par ce socle, par ordre de priorité :

1. **Double authentification du personnel** (exigée par la section 3) — à faire avant toute mise en recette.
2. Intégrations réelles : passerelles SMS (deux minimum), Firebase Cloud Messaging, cartographie et
   géocodage, stockage objet chiffré avec URL de dépôt signées (les pièces KYC ne sont ici que des références).
3. Canal WebSocket (positions, statuts, messages) et stockage chaud des positions dans Redis ; aujourd'hui
   les clients interrogent l'API.
4. Fonctions restantes : connexion Google/Facebook (P-02), lieux favoris (P-04), rappels (P-21), retard
   (P-25), détection d'anomalies (S-12), clôture automatique après délai (P-34), trajets récurrents (C-25),
   re-confirmation après modification de l'heure ou du lieu, reçus et exports comptables (7.5),
   anti-fraude (S-05), niveau de confiance 3.
5. Messages d'erreur traduits (les codes d'erreur stables sont déjà renvoyés), référentiel daïras/communes.
