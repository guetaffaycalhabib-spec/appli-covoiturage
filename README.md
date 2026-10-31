# WinFleet

Application de gestion pour transporteurs : **flotte**, **chauffeurs**, **sous-traitants** et **missions**.

## Lancer l'application

Aucune installation : ouvrez `index.html` dans un navigateur.
Ou, pour la servir en local :

```bash
python3 -m http.server 8000   # puis http://localhost:8000
```

Les données sont enregistrées dans le navigateur (localStorage). Un jeu de démonstration est chargé au premier lancement. Les boutons **Exporter** et **Importer** permettent de sauvegarder ou transférer les données au format JSON.

## Fonctionnalités (MVP)

| Module | Contenu |
| --- | --- |
| **Tableau de bord** | Indicateurs (véhicules dispo / en mission / atelier, chauffeurs actifs, CA du mois), alertes d'échéances, missions du jour, missions à affecter |
| **Véhicules** | Immatriculation, type, kilométrage, statut, contrôle technique, assurance, chronotachygraphe, révision |
| **Chauffeurs** | Coordonnées, catégories de permis, statut, validité du permis, FIMO/FCO, carte conducteur, visite médicale |
| **Sous-traitants** | Raison sociale, SIRET, contact, licence de transport, attestation de vigilance URSSAF, attestation d'assurance |
| **Missions** | Client, trajet, date, statut, affectation interne (véhicule + chauffeur) ou sous-traitance, prix de vente / d'achat et marge |

**Alertes automatiques** : tout document expiré (rouge) ou arrivant à échéance dans les 30 jours (orange) apparaît sur le tableau de bord. Lors de l'affectation d'une mission, les ressources dont un document est expiré sont signalées par ⚠.

## Structure

```
index.html      page unique
css/styles.css  styles (thème clair/sombre, responsive mobile)
js/app.js       logique : schéma des entités, listes, formulaires, alertes
```

Les entités sont décrites par un schéma dans `js/app.js` (`ENTITIES`) : ajouter un champ à un formulaire revient à ajouter une ligne au schéma.

## Feuille de route

- Backend et base de données partagée (multi-utilisateurs, comptes, rôles exploitant / chauffeur)
- Planning visuel des véhicules et chauffeurs
- Gestion documentaire (pièces jointes : cartes grises, attestations…)
- Facturation clients et autofacturation des sous-traitants
- Application mobile chauffeur (ordre de mission, preuve de livraison / e-CMR)
- Suivi des coûts : carburant, péages, entretien
