# Génération : messages, rendu et vérification financière — 12 octobre 2026

## Messages

La page utilise le statut renvoyé par le serveur, y compris après une création rejouée :

- RESERVING/QUEUED : demande enregistrée, préparation à venir.
- GENERATING/FINALIZING : préparation en cours, sans annoncer des fichiers prêts.
- FAILED : échec explicite, détail et reprise des invitations en échec.
- PARTIAL : nombre disponible après financement confirmé et nombre à reprendre. Avant confirmation ou si l’archive expire, aucun téléchargement disponible n’est annoncé.
- Fichiers disponibles et financement confirmé : message « Vos invitations sont prêtes. Vous pouvez les télécharger à nouveau gratuitement. »

Les titres deviennent « Préparation de vos invitations » et « Générations récentes ». Les erreurs par invitation sont visibles dans le détail ; aucun statut d’échec n’est transformé en succès.

## Cause reproduite

La lecture des logs ne donnait que les avertissements génériques d’outbox. Le détail des deux lots indique RENDER_FAILED après trois tentatives. Un appel isolé au renderer avec le snapshot existant reproduit : `spawn /usr/bin/qrencode ENOENT`. Ni qrencode ni Chromium ne sont présents dans l’image en fonctionnement.

Le Dockerfile Invitations installe désormais qrencode, Chromium et les polices de base, avec les chemins explicites des exécutables. Les nouvelles erreurs de worker journalisent uniquement identifiants de lot/item, tentative et code sûr ; un exécutable absent est distingué par RENDER_DEPENDENCY_MISSING. Aucun snapshot, QR, token ou secret n’est journalisé.

## Vérification réelle des deux lots, en lecture seule

| Lot | Résultat | Réservation Wallet | Journal SETTLEMENT |
| --- | --- | --- | --- |
| a612788e-dd49-476d-8ca6-d8f3ce51c5e4 | FAILED, 0 succès, 1 échec | 1 crédit, statut CONSUMED | consumedCredits=0, releasedCredits=1, availableDelta=+1, reservedDelta=-1 |
| cad4f1cc-d625-4bf6-b2bb-2aa5f8d3a070 | FAILED, 0 succès, 1 échec | 1 crédit, statut CONSUMED | consumedCredits=0, releasedCredits=1, availableDelta=+1, reservedDelta=-1 |

Le statut CONSUMED de la réservation correspond ici à sa clôture par le règlement ; le journal prouve une consommation nulle et la restitution de la réservation. Aucun quota agence réservé sur ces deux lots. **Aucune régularisation ni mutation de solde effectuée par cette intervention.** Les marqueurs locaux settledAt/settlementCredits de ces anciens lots sont absents malgré le règlement Wallet confirmé.

## Reprise technique

La reprise conserve le snapshot et la version d’invitation, ne reprend que les échecs et reste liée au lot source par retryOfBatchId unique. Son rejeu retourne le même lot enfant, sans nouvelle réservation. Une nouvelle émission volontaire reste une action distincte.

Pour un ancien échec de rendu sans marqueur financier, le serveur doit obtenir la confirmation du règlement original à zéro avec sa clé idempotente originale avant de réserver la reprise. Un règlement différent ou incertain bloque la reprise. Cette réconciliation se fait uniquement lors d’une reprise explicitement demandée ; aucun des deux lots réels n’a été relancé dans cette passe. Une réservation pour la reprise peut immobiliser temporairement un crédit, mais les tentatives échouées ne constituent pas une nouvelle consommation.

## Validation

- Tests messages/confirmation : 3/3 réussis.
- Tests Invitations/finalisation : 15/15 réussis, dont blocage de reprise sans confirmation et rejeu sans nouvelle émission. Tests avec doubles de dépendances.
- Typecheck Web/Invitations et lint ciblé : réussis.
- Vérification financière : PostgreSQL réel en lecture seule, tables Invitations et Wallet.
- Aucun paiement ni appel IA effectué. Parcours UI authentifié et téléchargement réel du lot repris non validés.

Services concernés par cette correction : **web et invitations**. Le build Invitations est ciblé ; ne pas reconstruire toute la stack. Les changements SQL de la passe précédente restent conservés.

## Fichiers modifiés dans cette passe

- apps/web/src/app/events/[eventId]/invitations/workspace.tsx
- apps/web/src/lib/invitation-confirmation.mjs
- apps/web/src/lib/invitation-confirmation.d.mts
- apps/web/src/lib/invitation-confirmation.test.mjs
- services/invitations/Dockerfile
- services/invitations/src/invitation.service.ts
- services/invitations/src/invitation.service.spec.ts
- docs/runtime-invitation-generation.md
- apps/web/tsconfig.tsbuildinfo : actualisé par TypeScript.

## Résultat du build et du rendu réel

- docker compose build invitations : réussi (image contenant les outils de rendu).
- Test dans un conteneur ponctuel de la nouvelle image, sans entrypoint applicatif ni migration : le snapshot du lot a612788e-dd49-476d-8ca6-d8f3ce51c5e4 produit un PDF de 8 042 072 octets avec en-tête %PDF- valide.
- Aucun fichier publié dans MinIO, aucune génération finale enregistrée, aucun débit, aucun lot réel relancé. Les fichiers temporaires du renderer sont supprimés. La composition visuelle et le décodage QR du PDF ne sont pas validés par ce test.
- Les services existants n’ont pas été recréés. Pour appliquer : docker compose build web, puis docker compose up -d --no-deps invitations web. La nouvelle image Invitations est déjà construite.
- Les avertissements d’outbox RabbitMQ, distincts de la panne des exécutables de rendu, restent à traiter selon le diagnostic 401 de la passe précédente.
