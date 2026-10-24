# Covoiturage inter-wilayas

Plateforme de covoiturage planifié entre wilayas pour l'Algérie, avec l'expérience des applications de
chauffeurs privés (prix connu d'avance, suivi en direct, code de prise en charge, partage de trajet, SOS,
portefeuille, notation réciproque) — sans course à la demande ni tarification dynamique.

| Dossier | Contenu | État |
| --- | --- | --- |
| [`backend/`](backend/README.md) | API principale NestJS + PostgreSQL (MVP phase 1) | Socle fonctionnel, testé |
| `mobile/` | Application Flutter passager / conducteur | À venir |
| `admin/` | Back-office React | À venir (l'API `/admin` existe) |

Démarrage rapide :

```bash
docker compose up --build        # PostgreSQL + API sur http://localhost:3000
open http://localhost:3000/api/docs
```
