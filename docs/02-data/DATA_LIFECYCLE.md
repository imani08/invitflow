# Cycle de vie des données

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PARTIAL**

| Données | Création / mouvement | Suppression / durée |
|---|---|---|
| Compte et profil | Identité Keycloak; profil séparé dans Profile DB | demande de suppression existe; effacement réel multi-service doit être vérifié |
| Invités/imports | service Guests; job d’import possède statut et compteurs | service d’expiration d’import présent; durée exacte provient de config/code |
| Médias | quarantaine MinIO → vérification ClamAV/transcodage → bucket ready privé | suppression/tombstone et cleanup présents; politique légale doit être approuvée |
| Invitations | snapshots par version et batch en DB; PDF/ZIP en MinIO privé | expiration ZIP/cleanup configurés; rétention globale non approuvée |
| Paiements/ledger | snapshot ordre et transitions Payments; entrée Wallet append-only | conservation financière à définir par conseil juridique; aucune purge arbitraire |
| Audit/notifications | événements filtrés/dédupliqués et préférences | TTL/rétention à confirmer selon politique |
| Sessions | tokens chiffrés dans Redis; cookie navigateur opaque | TTL session 8 h; actualité à confirmer au code |

Les détails définitifs doivent refléter les migrations et paramètres de déploiement actifs, non une supposition documentaire.
