# Cahier des charges — Plateforme de gestion de promotion immobilière (Algérie)

**Projet :** Plateforme web de gestion d'une société de promotion immobilière (nom de travail : *El Omrane*)
**Version :** 1.0 (brouillon à valider)
**Date :** 25/10/2026
**Statut :** En attente de validation par le maître d'ouvrage avant développement

---

## Sommaire

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [Périmètre](#2-périmètre)
3. [Utilisateurs, rôles et droits](#3-utilisateurs-rôles-et-droits)
4. [Spécifications fonctionnelles](#4-spécifications-fonctionnelles)
   - 4.1 Projets, blocs et biens
   - 4.2 Clients et réservations
   - 4.3 Avances, échéanciers et paiements clients
   - 4.4 Sous-traitants et fournisseurs
   - 4.5 Cahiers des charges par lot / article
   - 4.6 Contrats, situations et paiements des sous-traitants
   - 4.7 Dépenses diverses
   - 4.8 Trésorerie et balance dépenses / recettes / reste
   - 4.9 Suivi des travaux
   - 4.10 Tableaux de bord et rapports
   - 4.11 Documents et éditions
   - 4.12 Notifications et alertes
   - 4.13 Administration et journal d'audit
5. [Règles de gestion](#5-règles-de-gestion)
6. [Modèle de données (principales entités)](#6-modèle-de-données-principales-entités)
7. [Exigences non fonctionnelles](#7-exigences-non-fonctionnelles)
8. [Architecture technique proposée](#8-architecture-technique-proposée)
9. [Planning et lotissement du développement](#9-planning-et-lotissement-du-développement)
10. [Livrables et critères de recette](#10-livrables-et-critères-de-recette)
11. [Points à valider avec le client](#11-points-à-valider-avec-le-client)

---

## 1. Contexte et objectifs

### 1.1 Contexte

La société exerce l'activité de **promotion immobilière en Algérie** (logements promotionnels, LPP/LPA éventuels, locaux commerciaux, parkings). Elle vend principalement en **Vente Sur Plans (VSP)**, encaisse des **avances et tranches** auprès des acquéreurs, et fait réaliser les travaux par des **sous-traitants** par corps d'état (gros œuvre, étanchéité, électricité, plomberie, menuiserie, peinture, etc.).

Aujourd'hui la gestion est faite sur Excel / papier, ce qui entraîne :
- des difficultés à savoir **qui a payé quoi** et **combien reste à encaisser** ;
- un manque de visibilité sur **ce qui a été payé aux sous-traitants** par rapport à l'avancement réel ;
- l'absence de **cahiers des charges standardisés** par lot ;
- des **dépenses diverses** non tracées ;
- pas de **balance claire** entre recettes, dépenses et reste à payer / à encaisser.

### 1.2 Objectifs

| # | Objectif |
|---|----------|
| O1 | Centraliser la gestion des projets, blocs, biens (appartements, locaux…) et leur disponibilité. |
| O2 | Gérer les réservations clients, les contrats, les échéanciers, les avances et les paiements. |
| O3 | Gérer les sous-traitants : cahiers des charges, contrats, situations de travaux, paiements, retenues. |
| O4 | Éditer des cahiers des charges par lot à partir d'une bibliothèque d'articles, prêts à être signés. |
| O5 | Enregistrer toutes les dépenses (y compris les dépenses diverses) avec justificatifs. |
| O6 | Fournir une balance en temps réel : recettes, dépenses, engagements, reste à encaisser, reste à payer. |
| O7 | Suivre l'avancement physique et financier des travaux. |
| O8 | Donner à chaque collaborateur un compte personnel avec des droits adaptés à son rôle. |

---

## 2. Périmètre

### 2.1 Inclus (version 1)

- Application web (ordinateur, tablette, smartphone) en **français** (arabe en option, voir §11).
- Gestion multi-projets.
- Modules : projets & biens, clients & réservations, encaissements, sous-traitants, cahiers des charges, contrats et situations, dépenses diverses, trésorerie & balance, suivi des travaux, tableaux de bord, utilisateurs & droits, éditions PDF.
- Monnaie : **Dinar algérien (DZD)**.

### 2.2 Exclus (version 1) — évolutions possibles

- Comptabilité générale complète (plan comptable SCF, liasse fiscale) : la plateforme fournit des **exports** pour le comptable.
- Paie du personnel.
- Portail client en ligne (consultation de son dossier par l'acquéreur) — prévu en phase 2.
- Application mobile native (la version web sera responsive).
- Signature électronique à valeur légale (signature manuscrite sur document imprimé en V1).

---

## 3. Utilisateurs, rôles et droits

Chaque utilisateur dispose d'un **compte personnel** (identifiant + mot de passe), rattaché à un **rôle** et éventuellement limité à certains **projets**.

### 3.1 Rôles

| Rôle | Description |
|------|-------------|
| **Administrateur / Gérant** | Accès total. Gère les utilisateurs, les paramètres, valide les opérations sensibles. |
| **Directeur financier / Comptable** | Encaissements, paiements, dépenses, trésorerie, balance, exports. |
| **Caissier** | Saisie des encaissements et décaissements de caisse, édition des reçus. |
| **Chef de projet** | Pilote un ou plusieurs projets : sous-traitants, cahiers des charges, situations, suivi des travaux, dépenses du chantier. |
| **Conducteur de travaux / Chef de chantier** | Saisie de l'avancement, rapports journaliers, photos, attachements, demandes de dépenses. |
| **Commercial** | Biens disponibles, prospects, réservations, contrats clients, suivi des échéances de ses clients. |
| **Consultation (lecture seule)** | Associé, auditeur… : consulte les tableaux de bord et rapports sans modifier. |

Les rôles sont **paramétrables** : l'administrateur peut créer un nouveau rôle et cocher les permissions.

### 3.2 Matrice des droits (par défaut)

Légende : **C** = créer, **L** = lire, **M** = modifier, **S** = supprimer/annuler, **V** = valider, — = aucun accès.

| Module | Admin | Financier | Caissier | Chef de projet | Conducteur | Commercial | Consultation |
|--------|:-----:|:---------:|:--------:|:--------------:|:----------:|:----------:|:------------:|
| Projets / biens | CLMS | L | L | LM | L | L | L |
| Prix de vente | CLMSV | L | — | L | — | L | L |
| Clients / réservations | CLMSV | L | L | L | — | CLM | L |
| Encaissements clients | CLMSV | CLMV | CL | L | — | L (ses clients) | L |
| Sous-traitants | CLMS | L | — | CLM | L | — | L |
| Cahiers des charges | CLMSV | L | — | CLM | L | — | L |
| Contrats sous-traitants | CLMSV | LV | — | CLM | L | — | L |
| Situations de travaux | CLMSV | LV | — | CLMV | CL | — | L |
| Paiements sous-traitants | CLMSV | CLMV | CL | L | — | — | L |
| Dépenses diverses | CLMSV | CLMV | CL | CL (son projet) | C (demande) | C (demande) | L |
| Trésorerie / balance | L | L | L (caisse) | L (son projet) | — | — | L |
| Suivi des travaux | CLMS | L | — | CLMV | CLM | L | L |
| Utilisateurs / paramètres | CLMS | — | — | — | — | — | — |
| Journal d'audit | L | L | — | — | — | — | — |

### 3.3 Exigences sur les comptes

- Mot de passe robuste, changement obligatoire à la première connexion, réinitialisation par l'administrateur ou par e-mail.
- Possibilité de **désactiver** un compte (départ d'un employé) sans perdre l'historique.
- Restriction par projet : un chef de projet ne voit que ses projets.
- Déconnexion automatique après inactivité (paramétrable, 30 min par défaut).
- Double authentification (2FA) optionnelle pour Admin et Financier.

---

## 4. Spécifications fonctionnelles

### 4.1 Projets, blocs et biens

**Projet** : nom, code, wilaya, commune, adresse, n° de permis de construire, date du permis, superficie du terrain, nature (promotionnel, LPP, LPA, mixte), dates prévisionnelles (début, fin), budget prévisionnel, chef de projet, statut (étude, en cours, réceptionné, clôturé), notaire du projet, documents (permis, plans, acte du terrain…).

**Bloc / bâtiment** : nom (Bloc A, B…), nombre d'étages, nombre de biens.

**Bien (lot de vente)** : référence (ex. `A-03-12`), type (F2, F3, F4, F5, duplex, local commercial, parking, cave), étage, superficie habitable et utile, orientation, options, **prix de vente** (au m² et total), statut :

```
Disponible → Réservé (option) → Réservé (avance versée) → Contrat VSP signé → Livré
                    ↘ Annulé / Désisté → Disponible
```

Fonctionnalités :
- Vue **tableau** et vue **plan / grille par étage** avec code couleur par statut.
- Filtres : projet, bloc, type, étage, statut, fourchette de prix.
- Historique des prix (toute modification de prix est tracée).
- Blocage d'un bien pour un client (option) avec date d'expiration automatique (ex. 7 jours).

### 4.2 Clients et réservations

**Fiche client (acquéreur)** : nom, prénom (en français et en arabe), date et lieu de naissance, n° CNI / NIN, adresse, téléphone(s), e-mail, profession, situation familiale, co-acquéreur éventuel, mode de financement (fonds propres, crédit bancaire — banque, n° de dossier), pièces jointes (CNI, acte de naissance, attestation de travail, accord bancaire…).

**Prospects** : enregistrement des visiteurs intéressés, source (bouche-à-oreille, Facebook, salon…), relance, conversion en client.

**Réservation** :
- Sélection du bien (uniquement s'il est disponible) ;
- Prix convenu, remise éventuelle (avec validation Admin au-delà d'un seuil) ;
- Montant de l'avance / premier versement ;
- Choix d'un **échéancier** (voir 4.3) ;
- Commercial responsable ;
- Génération du **bon / contrat de réservation** en PDF ;
- Statuts : en cours, confirmée, convertie en contrat VSP, annulée / désistement.

**Contrat VSP** : date de signature chez le notaire, référence de l'acte, date de publication, garantie FGCMPI (n° d'attestation), date prévisionnelle de livraison.

**Désistement / annulation** : motif, montant à rembourser, pénalités éventuelles (paramétrables), remboursement suivi comme un décaissement, remise du bien en « Disponible ».

**Changement de bien / cession** : transfert d'une réservation vers un autre bien ou un autre acquéreur avec historique.

### 4.3 Avances, échéanciers et paiements clients

**Échéancier** : modèle paramétrable par projet, en pourcentage du prix ou en montant, lié soit à des **dates** soit à des **étapes d'avancement** des travaux. Exemple de modèle VSP (à valider avec le notaire selon la réglementation en vigueur) :

| Tranche | Événement déclencheur | % |
|---------|------------------------|---|
| 1 | Signature du contrat | 20 % |
| 2 | Achèvement des fondations | 15 % |
| 3 | Achèvement du gros œuvre et de l'étanchéité | 35 % |
| 4 | Achèvement des travaux tous corps d'état | 25 % |
| 5 | Remise des clés | 5 % |

Quand le chef de projet déclare une étape d'avancement atteinte (module 4.9), les tranches liées deviennent **exigibles** et les clients concernés apparaissent dans la liste des appels de fonds.

**Encaissement** :
- Client, réservation, tranche concernée (ou paiement libre réparti automatiquement sur les tranches les plus anciennes) ;
- Montant, date, **mode de paiement** : espèces, chèque (n°, banque), virement bancaire, versement CCP / BaridiMob, crédit bancaire (déblocage) ;
- Compte de destination (caisse, compte bancaire X) ;
- Justificatif scanné ;
- Génération d'un **reçu numéroté** en PDF (numérotation séquentielle par année, non modifiable) ;
- Statut des chèques : reçu, déposé, encaissé, rejeté (un chèque rejeté annule l'encaissement et alerte).

**Situation client** (à tout moment) : prix total, total payé, reste à payer, tranches échues non payées, retard en jours, historique complet. Édition d'un **relevé de compte client** et d'une **lettre de relance / appel de fonds** en PDF.

### 4.4 Sous-traitants et fournisseurs

**Fiche** : raison sociale ou nom, forme juridique, **RC, NIF, NIS, article d'imposition**, adresse, contacts, RIB, spécialités (corps d'état), attestations (CNAS, CASNOS, mise à jour fiscale) avec **date d'expiration et alerte**, évaluation (qualité, délais, notes internes), liste noire éventuelle.

Distinction **sous-traitant** (exécute des travaux sur contrat) / **fournisseur** (vend des matériaux : ciment, rond à béton, carrelage…) / **prestataire** (bureau d'études, laboratoire, géomètre, notaire…).

### 4.5 Cahiers des charges par lot / article

Objectif : éditer pour chaque sous-traitant un cahier des charges complet, prêt à être imprimé et signé.

**Bibliothèque d'articles** (réutilisable sur tous les projets) :
- Organisée par **lot / corps d'état** : terrassement, gros œuvre, maçonnerie, étanchéité, plomberie sanitaire, chauffage, électricité, menuiserie bois, menuiserie aluminium, ferronnerie, carrelage / revêtements, peinture, VRD, ascenseurs…
- Chaque **article** : code (ex. `GO-012`), désignation, description technique détaillée (matériaux, normes DTR, mode d'exécution), unité (m², m³, ml, kg, U, forfait), prix unitaire de référence.
- Clauses générales types : objet, délais, pénalités de retard, retenue de garantie, réception provisoire et définitive, assurance, hygiène et sécurité, résiliation, litiges (tribunal compétent).

**Création d'un cahier des charges** :
1. Choisir le projet, le lot et le sous-traitant (ou le laisser en appel d'offres) ;
2. Sélectionner les articles dans la bibliothèque, ajuster les descriptions, quantités et prix ;
3. Le système génère le **Bordereau des Prix Unitaires (BPU)** et le **Devis Quantitatif et Estimatif (DQE)** avec totaux HT, TVA (taux paramétrable), TTC, montant en lettres ;
4. Ajouter / modifier les clauses particulières (délai d'exécution, montant de l'avance, taux de retenue de garantie, pénalités par jour de retard…) ;
5. **Générer le PDF** : page de garde avec logo, sommaire, clauses, articles, BPU/DQE, page de signatures (maître d'ouvrage / sous-traitant, avec mention « lu et approuvé ») ;
6. Statuts : brouillon → en validation → validé → signé (scan du document signé téléversé) → archivé ;
7. **Versionnement** : toute modification après validation crée une nouvelle version ; un avenant peut être généré.

Possibilité de dupliquer un cahier des charges d'un projet à l'autre.

### 4.6 Contrats, situations et paiements des sous-traitants

**Contrat / marché** : créé à partir d'un cahier des charges signé : montant du marché, délai, date d'ordre de service (ODS), avance forfaitaire éventuelle, taux de retenue de garantie (ex. 5 %), pénalités. **Avenants** (augmentation / diminution du montant ou du délai).

**Situation de travaux (attachement)** :
- Saisie périodique des **quantités réalisées par article** (cumul précédent + période = cumul actuel) ;
- Calcul automatique : montant cumulé, montant de la période, déduction de l'avance (remboursement au prorata), **retenue de garantie**, pénalités de retard, net à payer ;
- Circuit de validation : saisie (conducteur de travaux) → vérification (chef de projet) → validation financière → bon pour paiement ;
- Édition PDF de la situation à faire signer.

**Paiements sous-traitants** : rattachés à une situation ou à une avance ; mode (chèque, virement, espèces), compte débité, justificatif. **Libération de la retenue de garantie** à la réception définitive.

**Situation financière d'un sous-traitant** : montant du marché (avec avenants), réalisé, payé, retenues, reste à payer, reste à réaliser.

**Achats de matériaux** (fournisseurs) : bons de commande, réception, factures, paiements — rattachés au projet et au lot.

### 4.7 Dépenses diverses

Toute dépense n'entrant pas dans un contrat : frais administratifs (timbres, frais de notaire, permis, CTC, raccordements Sonelgaz / ADE), carburant, location d'engins, gardiennage, petits achats, réparations, frais de bureau, publicité, déplacements, etc.

- Saisie : date, projet (ou « siège / frais généraux »), **catégorie** (paramétrable), bénéficiaire, montant, mode de paiement, compte / caisse, justificatif (photo du ticket / facture), commentaire.
- **Demandes de dépense** : un conducteur ou commercial peut faire une demande → validation par le chef de projet / Admin selon un **seuil paramétrable** → paiement par la caisse.
- **Avances au personnel / bons de caisse** : avance remise à un employé, puis justification et régularisation.

### 4.8 Trésorerie et balance dépenses / recettes / reste

**Comptes** : caisses (siège, chantier) et comptes bancaires (BNA, CPA, BEA, BADR, CNEP, AGB…). Chaque mouvement (encaissement, paiement, dépense, virement interne) met à jour le solde. Rapprochement bancaire simple (pointage des relevés).

**Balance par projet** (et consolidée) :

| Indicateur | Calcul |
|------------|--------|
| Chiffre d'affaires vendu | Somme des prix des biens réservés / vendus |
| Total encaissé | Somme des paiements clients |
| **Reste à encaisser** | CA vendu − encaissé |
| Dont échu non payé | Tranches exigibles non réglées |
| Valeur du stock disponible | Prix des biens non vendus |
| Budget prévisionnel des travaux | Somme des budgets par lot |
| Engagé (marchés signés + avenants + commandes) | |
| Réalisé (situations validées) | |
| Total payé sous-traitants / fournisseurs | |
| Total dépenses diverses | |
| **Reste à payer** | Réalisé − payé (+ retenues de garantie à libérer) |
| **Reste à engager** | Budget − engagé |
| **Solde de trésorerie du projet** | Encaissé − total décaissé |
| Marge prévisionnelle | CA total prévu − coût total prévu |

- Comparaison **budget / engagé / réalisé / payé** par lot avec écarts en DZD et en %.
- **Prévisionnel de trésorerie** : encaissements attendus (échéanciers) vs décaissements prévus (situations, échéances contrats) par mois.
- Filtres par période, projet, lot, catégorie.

### 4.9 Suivi des travaux

- **Planning** par projet : lots / tâches, dates prévues, dates réelles, dépendances simples ; affichage type diagramme de Gantt.
- **Avancement** : pourcentage par lot et par bloc, global pondéré ; déclaration des **étapes clés** (fondations, gros œuvre, étanchéité, TCE, réception) qui déclenchent les tranches clients.
- **Rapport journalier de chantier** : date, météo, effectif par sous-traitant, travaux réalisés, matériaux reçus, incidents, photos géolocalisées / horodatées.
- **Réserves et non-conformités** : description, photo, lot, sous-traitant responsable, date limite, statut (ouverte / levée).
- **Réceptions** : provisoire et définitive par lot, avec PV en PDF.
- **Visites** du bureau de contrôle (CTC) et du bureau d'études, avec comptes rendus.
- Galerie photos par projet / bloc / date.

### 4.10 Tableaux de bord et rapports

**Tableau de bord Direction** : biens vendus / disponibles, CA vendu, encaissé, reste à encaisser, impayés en retard, dépenses du mois, trésorerie par compte, avancement des projets, alertes.

**Tableau de bord Commercial** : biens disponibles, mes réservations, mes clients en retard, objectifs.

**Tableau de bord Chef de projet** : avancement, situations en attente, budget vs réalisé, réserves ouvertes.

**Rapports exportables (PDF / Excel)** :
- État des ventes par projet ;
- État des encaissements par période / mode de paiement ;
- Liste des impayés et retards ;
- Situation de chaque sous-traitant ;
- État des dépenses par catégorie ;
- Balance projet et balance consolidée ;
- Journal de caisse / de banque ;
- Export comptable (format Excel / CSV pour le logiciel du comptable).

### 4.11 Documents et éditions

Tous les documents portent l'en-tête de la société (logo, raison sociale, RC, NIF, adresse) paramétrables :
- Bon / contrat de réservation ;
- Reçu de paiement ;
- Relevé de compte client, appel de fonds, lettre de relance, attestation de paiement ;
- Cahier des charges, BPU / DQE, contrat sous-traitant, avenant, ordre de service ;
- Situation de travaux, bon pour paiement ;
- Bon de dépense / bon de caisse ;
- PV de réception, PV de remise des clés.

Les modèles de documents doivent être **modifiables** par l'administrateur (texte des clauses). Montants écrits **en chiffres et en lettres** (en français, et en arabe si option retenue).

**Gestion électronique des documents (GED)** : téléversement de pièces jointes (PDF, images) sur chaque objet, recherche, documents signés archivés.

### 4.12 Notifications et alertes

Dans l'application (et par e-mail ; SMS en option) :
- Tranche client échue / client en retard de X jours ;
- Option de réservation qui expire ;
- Chèque rejeté ;
- Situation de travaux en attente de validation ;
- Attestation CNAS / CASNOS / fiscale d'un sous-traitant expirée ;
- Dépassement de budget d'un lot (seuil paramétrable, ex. 90 %) ;
- Demande de dépense à valider ;
- Retard de planning d'un lot ;
- Solde de caisse sous un seuil.

### 4.13 Administration et journal d'audit

- Gestion des utilisateurs, rôles, permissions, affectation aux projets.
- Paramètres : informations de la société, logo, taux de TVA, taux de retenue de garantie par défaut, catégories de dépenses, modèles d'échéanciers, modèles de documents, numérotation, seuils de validation.
- **Journal d'audit** : toute création, modification, suppression ou validation est enregistrée (utilisateur, date/heure, ancienne et nouvelle valeur). Les opérations financières ne sont jamais supprimées physiquement : elles sont **annulées** avec motif.
- Sauvegardes automatiques quotidiennes et restauration.

---

## 5. Règles de gestion

| Code | Règle |
|------|-------|
| RG01 | Un bien ne peut avoir qu'une seule réservation active. |
| RG02 | Le prix d'un bien réservé est figé dans la réservation ; une modification du prix catalogue ne l'affecte pas. |
| RG03 | Une remise supérieure au seuil paramétré nécessite la validation de l'Administrateur. |
| RG04 | Un encaissement validé ne peut pas être modifié ni supprimé ; seule une **annulation motivée** (avec contre-passation) est possible, par un profil autorisé. |
| RG05 | La numérotation des reçus est séquentielle, unique et sans trou, par année. |
| RG06 | Un paiement client non affecté à une tranche est imputé automatiquement à la tranche échue la plus ancienne. |
| RG07 | Le total des pourcentages d'un échéancier doit être égal à 100 %. |
| RG08 | Une situation de travaux ne peut pas dépasser, par article, la quantité du marché (avenant obligatoire sinon) — dépassement bloquant ou alerte selon paramétrage. |
| RG09 | Un paiement à un sous-traitant ne peut pas dépasser le net à payer des situations validées (+ avance contractuelle). |
| RG10 | La retenue de garantie est calculée sur chaque situation et n'est libérée qu'après réception définitive. |
| RG11 | Une dépense au-delà du seuil paramétré nécessite une validation avant paiement. |
| RG12 | Un compte de caisse ne peut pas avoir un solde négatif (bloquant). |
| RG13 | Le désistement d'un client remet le bien en statut « Disponible » une fois le remboursement enregistré ou soldé. |
| RG14 | Toute action est tracée dans le journal d'audit. |
| RG15 | Un utilisateur restreint à certains projets ne voit aucune donnée des autres projets. |
| RG16 | Tous les montants sont en DZD, avec 2 décimales, affichés avec séparateur de milliers (ex. `12 500 000,00 DA`). |

---

## 6. Modèle de données (principales entités)

```
Société ─┬─ Utilisateur ── Rôle ── Permission
         │        └── AffectationProjet
         │
         └─ Projet ─┬─ Bloc ── Bien ── HistoriquePrix
                    │            └── Réservation ─┬─ Client (+ co-acquéreur)
                    │                             ├─ Échéancier ── Tranche
                    │                             ├─ Encaissement ── Reçu
                    │                             └─ ContratVSP / Désistement
                    │
                    ├─ Lot (corps d'état) ── Budget
                    │     └─ CahierDesCharges (versions) ── LigneArticle ── Article (bibliothèque)
                    │               └─ Contrat/Marché ─┬─ Avenant
                    │                                  ├─ Situation ── LigneSituation
                    │                                  └─ PaiementSousTraitant
                    │                    (Sous-traitant / Fournisseur ── Attestation)
                    │
                    ├─ BonCommande ── FactureFournisseur ── PaiementFournisseur
                    ├─ Dépense ── CatégorieDépense / DemandeDépense
                    ├─ Planning ── Tâche ── Avancement ── ÉtapeClé
                    ├─ RapportJournalier ── Photo
                    ├─ Réserve / Réception (PV)
                    └─ Document (GED)

CompteTrésorerie (caisse / banque) ── MouvementTrésorerie
JournalAudit, Notification, Paramètre, ModèleDocument
```

Tous les mouvements financiers (encaissements, paiements, dépenses, virements internes) génèrent un **MouvementTrésorerie** unique, ce qui garantit la cohérence de la balance.

---

## 7. Exigences non fonctionnelles

| Domaine | Exigence |
|---------|----------|
| **Accessibilité** | Application web responsive : PC, tablette, smartphone (navigateurs Chrome, Firefox, Edge, Safari récents). |
| **Langue** | Interface en français ; saisie des noms en arabe supportée ; interface arabe (RTL) en option. |
| **Performance** | Pages affichées en moins de 2 s pour 50 utilisateurs simultanés ; listes paginées. |
| **Connexion** | Tolérance aux connexions lentes (pages légères) ; saisie chantier possible avec photos compressées. |
| **Sécurité** | HTTPS obligatoire, mots de passe hachés (bcrypt/argon2), contrôle d'accès côté serveur sur chaque requête, protection contre les injections SQL / XSS / CSRF, limitation des tentatives de connexion. |
| **Confidentialité** | Données personnelles des clients protégées conformément à la **loi 18-07** relative à la protection des personnes physiques dans le traitement des données à caractère personnel. |
| **Intégrité** | Aucune suppression physique des opérations financières ; audit complet. |
| **Sauvegarde** | Sauvegarde automatique quotidienne de la base et des fichiers, conservée 30 jours minimum, copie hors site ; procédure de restauration testée. |
| **Hébergement** | Serveur cloud ou hébergeur en Algérie (à choisir, voir §11) ; disponibilité visée 99 %. |
| **Maintenabilité** | Code versionné (Git), tests automatisés sur les calculs financiers, documentation technique. |
| **Évolutivité** | Multi-projets dès la V1 ; architecture prête pour le portail client et une application mobile. |

---

## 8. Architecture technique proposée

*(Proposition à valider — peut être adaptée aux préférences du client ou de l'équipe.)*

| Couche | Technologie proposée | Justification |
|--------|----------------------|---------------|
| Frontend | **React + TypeScript** (Next.js), bibliothèque de composants (shadcn/ui ou MUI) | Interface moderne, responsive, large communauté. |
| Backend / API | **Node.js + TypeScript** (NestJS) — API REST | Typage commun front/back, structure modulaire adaptée aux modules métier. |
| Base de données | **PostgreSQL** | Fiabilité transactionnelle, indispensable pour les données financières. |
| ORM | Prisma | Migrations versionnées, typage. |
| Authentification | JWT / sessions sécurisées + RBAC (rôles et permissions) | Comptes par utilisateur et droits fins. |
| Génération PDF | Modèles HTML → PDF (Puppeteer / Playwright) | Documents fidèles et modifiables (cahiers des charges, reçus…). |
| Fichiers | Stockage objet compatible S3 (ou disque serveur) | Justificatifs, photos, documents signés. |
| Exports | Excel (xlsx) / CSV | Pour le comptable. |
| Déploiement | Docker + docker-compose, reverse proxy (Nginx) + HTTPS | Installation simple chez n'importe quel hébergeur. |
| Tests | Tests unitaires (calculs : échéanciers, situations, balance) + tests de bout en bout | Fiabilité des montants. |

---

## 9. Planning et lotissement du développement

Développement en **itérations** avec démonstration à la fin de chaque phase.

| Phase | Contenu | Durée indicative |
|-------|---------|------------------|
| **0. Cadrage** | Validation du présent cahier des charges, maquettes des écrans principaux, choix d'hébergement. | 1–2 semaines |
| **1. Socle** | Authentification, utilisateurs, rôles et permissions, paramètres société, journal d'audit, projets / blocs / biens. | 2–3 semaines |
| **2. Commercial & encaissements** | Clients, prospects, réservations, échéanciers, encaissements, reçus, relevés, relances, désistements. | 3–4 semaines |
| **3. Sous-traitants & cahiers des charges** | Fiches sous-traitants, bibliothèque d'articles, éditeur de cahiers des charges, BPU/DQE, PDF, contrats, avenants. | 3–4 semaines |
| **4. Situations, paiements & dépenses** | Situations de travaux, retenues, paiements sous-traitants, fournisseurs, dépenses diverses, demandes de dépense, trésorerie. | 3–4 semaines |
| **5. Suivi des travaux** | Planning, avancement, étapes clés (lien avec échéanciers), rapports journaliers, photos, réserves, réceptions. | 2–3 semaines |
| **6. Balance, tableaux de bord & rapports** | Balance projet / consolidée, prévisionnel de trésorerie, tableaux de bord par rôle, exports. | 2 semaines |
| **7. Recette & mise en production** | Tests avec données réelles, reprise des données Excel existantes, formation des utilisateurs, déploiement. | 2 semaines |

**Total indicatif : 4 à 6 mois.** Une version utilisable (phases 1 + 2) peut être mise en service plus tôt pour commencer la saisie des réservations.

---

## 10. Livrables et critères de recette

### 10.1 Livrables

- Code source versionné sur le dépôt Git ;
- Application déployée (environnement de test + production) ;
- Manuel utilisateur par rôle (PDF) ;
- Documentation technique et procédure de sauvegarde / restauration ;
- Script d'import des données existantes (Excel).

### 10.2 Critères de recette (exemples)

- Un commercial réserve un bien disponible ; le bien passe en « Réservé » et n'est plus réservable par un autre.
- Un encaissement de 2 000 000 DA est saisi ; le reçu PDF est généré avec un numéro unique, le reste à payer du client et le solde du compte sont mis à jour.
- La déclaration « fondations achevées » rend exigible la tranche 2 de tous les clients du bloc et génère les appels de fonds.
- Un cahier des charges « Plomberie » est composé de 15 articles de la bibliothèque, le PDF (clauses + BPU/DQE + page de signatures) est généré, le document signé est téléversé.
- Une situation n°3 est saisie ; la retenue de garantie, la déduction d'avance et le net à payer sont exacts au dinar près.
- Une dépense diverse de carburant avec photo du ticket apparaît dans la balance du projet et dans le journal de caisse.
- La balance du projet affiche des totaux identiques à la somme des opérations détaillées.
- Un commercial ne peut pas accéder au module des paiements sous-traitants ; un chef de projet ne voit pas les projets qui ne lui sont pas affectés.

---

## 11. Points à valider avec le client

Merci de répondre à ces questions avant le début du développement :

1. **Nom de la société** et logo à utiliser (« El Omrane » ?), informations légales (RC, NIF, NIS, adresse).
2. **Nombre de projets** en cours et à venir, nombre approximatif de biens par projet.
3. **Nombre d'utilisateurs** et liste des rôles réels dans l'entreprise (les rôles du §3 conviennent-ils ?).
4. **Types de vente** pratiqués : VSP uniquement, ou aussi vente sur bien achevé, LPP, location ?
5. **Échéancier type** utilisé aujourd'hui (pourcentages et événements), et conditions de la réservation (montant de l'avance, délai avant contrat VSP).
6. **Règles de désistement** : pénalités appliquées, délai de remboursement.
7. **TVA** : taux applicables aux ventes et aux marchés de sous-traitance ; montants saisis en HT ou TTC ?
8. **Taux de retenue de garantie** et d'avance forfaitaire habituels avec les sous-traitants.
9. Disposez-vous déjà de **modèles de cahiers des charges / contrats** (Word, PDF) à reprendre comme base ?
10. **Seuils de validation** des dépenses et des remises.
11. **Langue** : interface en français uniquement, ou aussi en arabe ? Documents (reçus, contrats) en français, en arabe, ou bilingues ?
12. **Hébergement** : serveur en Algérie, cloud international, ou serveur local au bureau ?
13. **Notifications** : e-mail suffisant, ou SMS souhaités (prestataire SMS algérien) ?
14. **Reprise des données** : existe-t-il des fichiers Excel de clients / paiements à importer ?
15. **Priorités** : quel module est le plus urgent pour vous ?

---

*Une fois ce cahier des charges validé (avec vos réponses au §11), le développement démarrera par la phase 1.*
