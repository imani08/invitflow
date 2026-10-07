# Spécification des exigences logiciel (SRS)

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

## Contrôle de version

Identifiant: IV-SRS-1.0 · Date: 2026-10-07 · Source: dépôt courant. Les exigences marquées **observées** décrivent le code et non une validation d'acceptation ou de production. Toute exigence à confirmer demeure en attente de validation produit.

## Objectif et frontières

InvitaFlow aide des organisateurs à préparer des événements, gérer des invités, produire/distribuer des invitations et suivre les réponses. Le système inclut une web app Next.js, des APIs derrière un gateway, des services de domaine, et des dépendances d'identité, données, messagerie et fichiers. Les paiements externes, SMS, payout et intégrations dont les contrats marchands sont absents ne sont pas considérés disponibles.

## Acteurs

| ID | Acteur | Besoin |
|---|---|---|
| ACT-01 | Organisateur connecté | gérer événement, cérémonies, invités, design, invitations et RSVP |
| ACT-02 | Invité public | ouvrir une invitation et accepter/refuser selon le lien disponible |
| ACT-03 | Membre agence | opérations client/workspace selon rôles effectivement accordés |
| ACT-04 | Partenaire | consulter attribution/commission lorsqu’exposées |
| ACT-05 | Support/modération | traiter les dossiers autorisés et tracer les décisions |
| ACT-06 | Finance | suivre prix/paiements selon permission |
| ACT-07 | Worker/service | exécuter travaux asynchrones via identités de service |
| ACT-08 | Identity provider | authentifier les utilisateurs et appliquer les actions email |

## Exigences fonctionnelles

| ID | Exigence | Priorité | Preuve / état |
|---|---|---|---|
| FR-AUTH-001 | L’utilisateur s’authentifie par OIDC Authorization Code avec PKCE et callback serveur. | Must | Web/Keycloak code observé; navigateur runtime à valider |
| FR-AUTH-002 | La session Web n’est acceptée qu’avec email et `email_verified=true`. | Must | callback observé |
| FR-LEGAL-001 | L’inscription accepte les versions légales présentées et enregistre acceptation côté serveur. | Must | action Keycloak et package legal observés; parcours réel à valider |
| FR-EVENT-001 | Un organisateur peut créer et gérer événements/cérémonies selon ownership. | Must | contrôleurs/modèles observés |
| FR-GUEST-001 | Les invités peuvent être gérés/importés et assignés à des événements. | Must | services Guests/Seating observés |
| FR-DESIGN-001 | Le système peut préparer des designs et une assistance éditoriale/design. | Should | services présents; capacité IA distante variable |
| FR-MEDIA-001 | Les médias téléversés sont vérifiés/scannés avant disponibilité. | Must | pipeline code observé; dépendances runtime à valider |
| FR-INV-001 | La génération d’invitations est asynchrone et persistée; son état reste consultable. | Must | service/outbox/worker observés |
| FR-RSVP-001 | RSVP est enregistré par invitation/cérémonie; QR/check-in est vérifié côté serveur. | Must | code/modèles observés; usage réel à valider |
| FR-PAY-001 | Achat de crédits exige confirmation serveur d’un paiement vérifié. | Must | protections Payments/Wallet observées |
| FR-WALLET-001 | Une livraison d’événement dupliquée ne crédite pas le Wallet deux fois. | Must | consumer idempotent et contrainte observés |
| FR-NOTIFY-001 | Des notifications sont persistées et dispatchées selon canaux disponibles. | Should | service Notifications; délivrabilité à valider |
| FR-SEC-001 | Les endpoints appliquent authentification, rôle et/ou ownership pertinents. | Must | guards observés, audit exhaustif à réaliser |
| FR-ADMIN-001 | Support et finance disposent de vues autorisées pour opérations support/pricing. | Should | routes/écrans observés; couverture UI à confirmer |
| FR-AGENCY-001 | Agence/partenaire exposent les fonctions présentes sans présumer des payouts automatisés. | Could | périmètres explicitement partiels |

## Exigences non fonctionnelles

| ID | Exigence vérifiable | Priorité | Validation requise |
|---|---|---|---|
| NFR-PERF-001 | Les pages SSR rendent dates/heures sans dépendre du fuseau implicite de l’hôte. | Must | audit et tests ciblés |
| NFR-OBS-001 | Les erreurs et traces portent une corrélation de requête sans données/secrets sensibles. | Must | tests d’intégration et revue logs |
| NFR-SEC-001 | Les transitions financières sont atomiques, append-only et idempotentes. | Must | tests transactionnels/concurrence |
| NFR-SEC-002 | Les fichiers restent privés jusqu’à passage des contrôles du pipeline. | Must | vérifier ACL et URLs signées runtime |
| NFR-SEC-003 | Les données sont isolées par service et migration possédée par son service. | Must | vérifier déploiement réel |
| NFR-ACCESS-001 | Les thèmes clair et sombre préservent contraste lisible selon WCAG AA. | Should | audit contrastes automatisé + humain |
| NFR-ACCESS-002 | Les layouts sont utilisables sur viewport mobile et desktop. | Should | appareils réels / navigateur |
| NFR-AVAIL-001 | Les travaux asynchrones sont rejouables/diagnostiquables et ne perdent pas les demandes après transaction. | Must | tests de panne et broker |
| NFR-SEC-004 | Les secrets de production ne sont ni commités ni écrits dans les logs. | Must | scan et revue de configuration |
| NFR-AVAIL-002 | Les objectifs RTO/RPO et disponibilité sont formellement approuvés avant tout SLA. | Open | décision produit/opérations; aucune cible approuvée attestée |
| NFR-PRIV-001 | La collecte reste limitée aux données nécessaires; rétention/suppression doivent être approuvées par policy. | Must | revue code + politique/conseil juridique requise |
| NFR-PERF-002 | Un objectif p95 et charge maximale est défini avant engagement de performance. | Open | aucun benchmark/SLO approuvé attesté |

## Contraintes et hypothèses

PostgreSQL est partitionné par service/schema; RabbitMQ transporte les événements durables; Redis et MinIO ont des usages séparés. Keycloak est IdP. Kinshasa est fuseau souhaité pour le runtime RDC mais chaque périmètre de date doit être confirmé. Aucun seuil SLA ou volume officiel n’est attesté par le dépôt.

## Traçabilité

Les FR/NFR renvoient aux exigences/données/API/parcours dans `FUNCTIONAL_REQUIREMENTS.md`, `NON_FUNCTIONAL_REQUIREMENTS.md`, `../01-architecture/`, `../03-api/`, `../05-payments/`, `../06-auth-email/` et `../07-testing/`. La colonne preuve différencie le code observé des essais d’acceptation.
