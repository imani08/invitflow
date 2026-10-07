# Catalogue des API

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

| Domaine | Route(s) observée(s) | Authentification | Usage |
|---|---|---|---|
| Profile | `GET/PUT /v1/me`, `/v1/me/deletion-request` | Bearer Keycloak, subject du token | profil et demande de suppression |
| Events | `GET/POST /v1/events`, `GET/PATCH /:eventId`, publish/cancel, ceremonies | Bearer + ownership | événement et cérémonies |
| Guests | `/v1/events/:eventId/guests`, groups, ceremonies, imports | Bearer + event ownership | invités, accès et import |
| Seating | `/v1/events/:eventId/ceremonies/:ceremonyId/seating` | Bearer + ownership | tables/placement/import |
| Designs | `/v1/events/:eventId/designs` et versions | Bearer + ownership | catalogue et design JSON |
| Invitations | `/v1/events/:eventId/invitations/batches`, download, cancel; `/v1/public/invitations/:token` | Bearer propriétaire / signature publique | génération, lecture et RSVP |
| Check-in | `/v1/events/:eventId/check-in/scan`, list | Bearer + rôle/ownership | présence par cérémonie |
| Wallet | `/v1/wallet/me`, transactions | Bearer audience `wallet-api` | soldes et ledger de crédits |
| Payments | `POST /v1/payments`, `GET /v1/payments/me`, `/v1/payments/:id`; callbacks provider | Bearer, clé d’idempotence; callback dépend contrat | checkout/consultation |
| Billing | `/v1/pricing`, `/v1/quotes`, finance-admin schedules | Bearer + rôle | catalogue, devis et planning |
| Media | `/api/assets` create/upload/complete/download/delete | Bearer + owner scope | asset lifecycle |
| Notifications | `/v1/notifications`, preferences | Bearer + owner scope | inbox/préférences |
| Audit | moderation reports/events | role support/admin; ingestion service-to-service | revue et audit |
| AI Design | `/v1/events/:eventId/designs/:designId/ai-jobs` | Bearer audience `ai-design-api` | jobs de proposition |

Ce tableau n’est pas une liste exhaustive des sous-routes. Vérifier les contrôleurs avant l’intégration et les contrats type de chaque handler.

## Contrat par familles de routes

Le dépôt ne fournit pas de spécification OpenAPI centralisée couvrant Gateway et chaque service; les DTO Nest/controller restent les contrats d’autorité. Les descriptions suivantes résument le type de requête/réponse attendu sans inventer de JSON schéma qui n’est pas partagé entre handlers.

| Famille | Méthodes et chemin | Authentification / rôle | Requête | Réponse | Erreurs pertinentes |
|---|---|---|---|---|---|
| Profil | `GET/PUT /v1/me`, `POST /v1/me/deletion-request` | Bearer utilisateur | champs profil validés; demande de suppression | profil courant ou état de demande | `400`, `401`, `409`, erreurs upstream BFF |
| Événements | `GET/POST /v1/events`, `GET/PATCH /v1/events/:eventId`, actions publish/cancel | Bearer + ownership | filtres/pagination ou DTO événement/patch | collection paginée ou événement sérialisé | `400`, `401`, `403/404`, `409` |
| Invités/import | `/v1/events/:eventId/guests`, `.../imports` | Bearer + ownership de l’événement | DTO invité, filtres, job et contenu de fichier selon endpoint | invité/liste/job avec compteurs d’import | `400`, `401`, `403/404`, `409`, limites de validation |
| Placement | `/v1/events/:eventId/ceremonies/:ceremonyId/seating` | Bearer + ownership | tables, capacité, assignations ou mapping d’import | plan/assignation selon handler | `400`, `401`, `403/404`, `409` |
| Design | `/v1/events/:eventId/designs` et versions | Bearer + ownership | document design versionné et métadonnées | catalogue, document ou version créée | `400`, `401`, `403/404`, `409` |
| Lots invitations | `POST/GET .../invitations/batches`, cancel, download | Bearer propriétaire | sélection invités, cérémonie/design et demande de lot | identifiant/statut de batch, ou artefact en flux si terminé | `400`, `401`, `403/404`, `409`, `429` |
| RSVP public | `/v1/public/invitations/:token` | jeton d’invitation signé; pas de session organisateur | réponse de cérémonie | représentation publique réduite et statut RSVP | `400`, `404`, `409`; forme exacte dépend handler |
| Check-in | `POST .../check-in/scan`, listes | Bearer + rôle/ownership événement | QR/token et cérémonie | résultat de scan / présence | `400`, `401`, `403/404`, `409` doublon |
| Paiement | `POST /v1/payments`, `GET /v1/payments/me`, `GET /v1/payments/:id` | Bearer; idempotency lorsque implémentée | type/pack/quantité/clé opération | ordre/paiement et URL checkout si provider retourne | `400`, `401`, `403/404`, `409`, `503` |
| Wallet | `/v1/wallet/me`, transactions | audience Wallet ou Bearer proxy selon route | filtres et pagination | solde de crédits et ledger | `401`, `403`, `404`, `409` |
| Média | `/api/assets` create/upload/complete/download/delete | Bearer + ownership; presign scoped | métadonnées, octets objet, completion | asset state/URL signée limitée | `400`, `401`, `403/404`, `413`, `409`, `422` |
| Admin | finance/pricing/modération/audit | rôle Keycloak spécifique; route exacte par contrôleur | commande/filtres soumis au rôle | vue paginée ou résultat d’action | `400`, `401`, `403`, `404`, `409` |

Les rôles exacts, noms de DTO, tailles, statuts et pagination varient par handler. Confirmer la signature dans le contrôleur avant d’implémenter un client; les erreurs ci-dessus sont des catégories observées, pas un schéma uniforme garanti. Les endpoints callback fournisseur doivent vérifier signature, référence, montant/devise et statut côté serveur selon contrat merchant effectif; le contrat réel EasyPay/FlexPay n’est pas qualifié par cette documentation.
