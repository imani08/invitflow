# Diagnostic PDF réel — 12 octobre 2026

## Lots existants : lecture seule

Les lots `cad4f1cc-d625-4bf6-b2bb-2aa5f8d3a070` et `a612788e-dd49-476d-8ca6-d8f3ce51c5e4` ont chacun un item FAILED, trois tentatives, `errorCode=RENDER_FAILED`, aucun objectKey, zéro succès. Les marqueurs financiers locaux historiques sont absents.

Pour chacun, le journal PostgreSQL Wallet confirme : réservation `availableDelta=-1/reservedDelta=+1`, puis SETTLEMENT `availableDelta=+1/reservedDelta=-1`, `consumedCredits=0/releasedCredits=1`. Aucun crédit consommé ; la réservation a été libérée. Aucun quota agence réservé. Aucun ajustement manuel ni reprise de ces lots n'a été effectué.

## Chemin effectivement exécuté

1. `InvitationService.createBatch` crée le lot et ses versions/snapshots dans une transaction ; `reserveAndQueue` réserve puis place le lot QUEUED et écrit l'outbox. Une réponse 201 ne garantit pas le rendu.
2. `InvitationService.onModuleInit`, avec RENDER_WORKER_ENABLED, lance le worker local `work()`. Il recherche également les lots directement dans PostgreSQL. Une livraison RabbitMQ n'est pas nécessaire pour cette recherche.
3. Le worker prend un item avec contrôle de statut et de tentative, puis appelle son propre `render()`. Le rendu s'effectue **dans Invitations**, via qrencode et Chromium, pas via le service rendering.
4. Après rendu, `InvitationStorage.put` écrit dans MinIO sous une clé immuable par tentative ; l'item passe GENERATED après transaction/verrou du lot.
5. `finishIfDone` fige le nombre de succès en FINALIZING, relit les PDF, écrit et relit le ZIP, appelle le règlement Wallet/quota idempotent, puis confirme settledAt et le statut terminal.
6. Le contrôleur de téléchargement appelle `download`, qui exige le propriétaire et un lot financé. Un simple item GENERATED ne suffit pas.

## Cause prouvée

L'exception a été reproduite sur le snapshot existant : `spawn /usr/bin/qrencode ENOENT`. Ni qrencode ni Chromium n'étaient présents dans le conteneur en fonctionnement. L'identité de son image différait de celle de l'image corrigée déjà construite : le correctif n'avait pas été activé.

Le Dockerfile Invitations corrigé contient les deux exécutables et leurs chemins explicites. Le service rendering ne participe pas à ce chemin : aucune reconstruction de rendering requise.

Les nouvelles erreurs serveur incluent batchId, invitationId, itemId, tentative, étape claim/render/storage/commit et raison filtrée. Aucun snapshot, token, credential ou stderr brut n'est journalisé. Les échecs financiers portent aussi batchId sans annoncer de libération non confirmée.

L'ouverture visuelle du PDF de test a révélé un autre défaut local : le QR de secours était coupé, car la taille CSS ciblait svg mais pas img. La même taille bornée s'applique maintenant aux deux éléments.

## Outbox : diagnostic séparé

Depuis **Invitations et Wallet**, un GET en lecture seule vers l'API management RabbitMQ, avec les credentials effectivement configurés dans chaque service, retourne **HTTP 401**. Cela explique le rejet d'authentification sous-jacent aux avertissements. Aucun credential ou droit n'a été modifié. Ces avertissements ne prouvent pas la cause du rendu : le worker a effectivement fait trois tentatives et l'échec de l'exécutable a été reproduit indépendamment.

## Test reproductible

`node scripts/check-invitation-pdf-runtime.mjs`

Le lanceur exécute un conteneur Invitations ponctuel, sans entrypoint applicatif ni migrations. Il utilise les clients Prisma et les méthodes de service réelles avec des schémas PostgreSQL aléatoires et des objets MinIO sous un nouveau batch UUID. Le Wallet de test possède un crédit synthétique. Les schémas et objets sont nettoyés dans finally ; aucun solde client modifié.

Le lot RESERVING et son snapshot synthétique sont préparés par le test : la construction du snapshot via API Events/Designs/Guests n'est pas exercée. Réservation, prise en charge worker, qrencode/Chromium, stockage, finalisation et contrôleur de téléchargement sont exécutés. Le transport HTTP interne Wallet est adapté vers les méthodes Wallet réelles sur sa base isolée. L'identité du contrôleur est une fixture, pas une session OIDC : le parcours navigateur authentifié complet n'est pas validé.

Résultats du premier essai : COMPLETED ; 1 crédit réservé et consommé, 0 libéré ; un seul SETTLEMENT ; PDF HTTP 200, en-têtes application/pdf/attachment/no-store ; retéléchargement identique sans nouveau règlement ; propriétaire différent refusé ; ZIP HTTP téléchargeable avec intégrité vérifiée, contenant exactement le PDF téléchargé.

Le PDF a été ouvert avec pypdf, puis rendu en PNG avec PDFium et inspecté visuellement. Fichiers de preuve synthétiques, ignorés par Git : `coverage/runtime-pdf/invitation.pdf`, `invitations.zip`, `invitation-page-1.png`. Le dernier essai après la correction QR et l'activation de l'image est consigné ci-dessous.

## Fichiers de cette passe

- services/invitations/src/invitation.service.ts : logs sûrs par étape et taille du QR de secours.
- services/invitations/src/invitation.service.spec.ts : régression sur la taille du QR.
- scripts/check-invitation-pdf-runtime.mjs : lanceur d'intégration isolé.
- scripts/invitation-pdf-runtime-fixture.mjs : worker, stockage, règlement et téléchargement réels sur données isolées.
- docs/runtime-invitation-pdf-validation.md : preuves et limites.

Les modifications locales des passes précédentes, dont le Dockerfile avec les outils de rendu, restent conservées. Aucun appel IA, commit, push, réinitialisation de base ou suppression de volume.

## Dernier essai et activation : réussis

- Le POST de diagnostic sur /api/exchanges/%2F/invitaflow.events/publish, avec un corps incomplet ne pouvant publier aucun événement, confirme 401 not_authorized depuis Invitations et Wallet.
- docker compose build invitations puis docker compose up -d --no-deps invitations exécutés ; aucun autre service reconstruit/recréé dans cette passe.
- Image active identique à l’image construite : sha256:2b5fc02b72516494351a89065d1d4166c1c129aa23323a2077a56a3e96cbbe2c ; health=healthy ; qrencode et Chromium présents.
- Second test isolé sur cette image : COMPLETED, réservé=1, consommé=1, libéré=0, un seul règlement, téléchargement HTTP 200 et retéléchargement identique. PDF de 20 664 octets, SHA-256 1d6228d47f86141200a00865a970c417e6da730f13477d8336dba45e4b46db2f.
- PDF ouvert strictement par pypdf, une page, texte synthétique vérifié ; rendu PDFium inspecté : QR entier dans son cadre. Le décodage automatisé du QR et le parcours OIDC navigateur complet restent non validés.
- ZIP ouvert, intégrité validée, PDF extrait identique au téléchargement individuel. Ressources isolées nettoyées ; preuves locales conservées sous coverage/runtime-pdf, ignorées par Git.
- Typecheck Invitations, lint ciblé et 16 tests de service/finalisation : réussis ; git diff --check réussi.
- Les deux lots historiques restent en échec sans fichier, aucune reprise automatique ni régularisation manuelle. Leur reprise technique doit être explicitement demandée. L’authentification RabbitMQ reste un incident séparé non corrigé.
