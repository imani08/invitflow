# Incidents RabbitMQ et PDF — 12 octobre 2026

## Causes constatées et corrections appliquées

- RabbitMQ : l'API HTTP de gestion (`http://rabbitmq:15672`, vhost `/`)
  renvoyait 401 aux outbox Invitations, Wallet et Designs. Les trois services
  utilisaient `invitaflow`, avec le même secret que le conteneur broker, mais
  `rabbitmqctl list_users --formatter json` renvoyait `[]`. Les définitions
  chargées au démarrage contiennent la topologie, aucun utilisateur/permission.
  Ne pas supposer que les variables DEFAULT_USER/PASS réparent un volume existant.
- Création du seul compte applicatif absent avec le secret déjà injecté, tag
  `management` (pas `administrator`), permissions limitées au vhost `/` et aux
  préfixes des ressources InvitaFlow. L'exchange par défaut est autorisé en
  écriture pour les files de reprise. Aucun compte, message ou volume supprimé.
- `scripts/provision-rabbitmq-user.mjs` permet de reproduire cette réparation.
  Il vérifie la cohérence des credentials, crée seulement un compte absent,
  vérifie le mot de passe existant sans le remplacer, et ne révèle ni secrets
  ni sorties brutes de commandes. Il n'est pas exécuté automatiquement par Compose.
  Commande explicite après démarrage du broker et des applications :
  `node scripts/provision-rabbitmq-user.mjs`.
- Pas de défaut d'encodage de credentials constaté : HTTP Basic utilise les
  valeurs séparées ; le consommateur AMQP Analytics utilise un objet de connexion.

## Worker PDF effectivement exécuté

Événement : `02ebd32d-f8f8-4be4-b1ce-b5ebd4f88df8`.

Lot à 15:51:03 Kinshasa : `c8df425a-c30b-445a-bc12-336d29fea836`.
Invitation : `28b1c112-c292-45d8-9de9-2dbd24829816`.
Item : `05242331-c427-418f-bfed-5895d607ab15`, trois tentatives, `RENDER_FAILED`.
Reprise technique de `a612788e-dd49-476d-8ca6-d8f3ce51c5e4` (09:22:46).

Compose désactive le worker dans Invitations et l'active dans `rendering`, qui
étend Invitations. Reconstruire seulement Invitations ne met donc pas à jour
l'image distincte `invitaflow-rendering`.

L'image ancienne du worker, démarrée à 07:39 UTC, contenait qrencode et Chromium,
mais utilisait UID 996, home `/home/app` inexistant. Le rendu direct du snapshot
dans cette image échouait avec `Chromium render failed`. La capture isolée du
stderr Chromium a montré :

`Failed to create headless user data directory container.`

Le même snapshot réussissait dans l'image Invitations corrigée. Seul `rendering`
a été reconstruit et recréé :

```powershell
docker compose build rendering
docker compose up -d --no-deps rendering
```

Image active corrigée :
`sha256:834eec82f520a387c6d3423de886ad7f991c4096f5e2274c21ef4a48cd6b8327`.
UID 1000 (`node`), home existant, qrencode et Chromium disponibles. Le journal
structuré de rendu présent dans le code courant devient aussi actif dans ce worker.
Pour les prochaines modifications communes, reconstruire explicitement
`invitations rendering`, puis recréer ces deux services de façon ciblée.

## Vérifications réellement exécutées

- Publication confirmée et consommation AMQP avec Analytics, dans un exchange et
  une file de diagnostic isolés, supprimés après le test.
- Publication et consommation HTTP management avec les credentials Invitations,
  mêmes ressources isolées. Les réponses 201 sans corps sont correctement traitées
  par le diagnostic. Aucun événement de test envoyé aux échanges métier.
- HTTP `/api/whoami` : 200 depuis Invitations, Wallet et Designs ; zéro nouvel
  avertissement outbox pendant les 60 secondes observées après réparation.
- Outbox effectivement reprises : Invitations 6 publiées, Wallet 8, Designs 18 ;
  toutes avaient des tentatives antérieures, aucune restante non publiée au relevé.
- Inspection de l'idempotence existante : clés financières durables uniques,
  déduplication des notifications par événement source, événements Analytics
  dédupliqués, prise en charge des rendus pilotée par les états/leases PostgreSQL.
  Le drainage de la file ne réactive pas les lots FAILED.
- Test avec **le snapshot réel** et l'image rendering corrigée : schémas PostgreSQL
  isolés Invitations/Wallet, copies des images dans des clés MinIO de test, vrais
  Chromium, qrencode et stockage. Aucune mutation du lot source. Financement via
  vraies méthodes Wallet/transactions ; seul le transport HTTP Wallet est adapté
  dans le test. Solde synthétique initial : 1 crédit.
- Résultat : COMPLETED, PDF de 8 042 103 octets, ZIP vérifié, HTTP 200 du contrôleur,
  retéléchargement identique ; rejeu de settle puis du worker : une seule écriture
  SETTLEMENT, consommation 1, réservation restante 0. Téléchargement avant
  financement et par un autre propriétaire refusés.
- PDF ouvert avec pypdf et rasterisé avec PDFium : une page. QR réellement décodé
  avec ZXing ; hash du contenu égal à celui du lien signé attendu, sans journaliser
  le lien. PDF contenu dans le ZIP identique au PDF téléchargé.
- 11 tests `invitation.service.spec.ts` réussis avec `--test-isolation=none`
  (l'exécution standard avait rencontré `spawn EPERM` sous Windows).
- Syntaxe Node des trois scripts, `docker compose config --quiet`, `git diff --check`.

Les artefacts de diagnostic sont sous `coverage/runtime-pdf/`, ignorés par Git.
Ils peuvent contenir les informations du snapshot client. Le décodeur ZXing est
installé uniquement sous ce répertoire, sans modifier les dépendances applicatives.

## Situation financière observée, sans régularisation manuelle

| Lot | Réservé | Consommé confirmé | Libéré confirmé |
| --- | ---: | ---: | ---: |
| c8df425a-c30b-445a-bc12-336d29fea836 | 1 | 0 | 1 |
| a612788e-dd49-476d-8ca6-d8f3ce51c5e4 | 1 | 0 | 1 |
| cad4f1cc-d625-4bf6-b2bb-2aa5f8d3a070 | 1 | 0 | 1 |

Les montants proviennent des écritures RESERVATION/SETTLEMENT et des métadonnées
`consumedCredits:0, releasedCredits:1`, pas du seul libellé de réservation
`CONSUMED` qui signifie ici réservation finalisée. Chaque référence a une seule
écriture de règlement. Aucun débit réel supplémentaire, aucune relance utilisateur.
Le nouveau lot garde son ancien marqueur local `settledAt:null` : Wallet a confirmé
le règlement zéro mais l'ancien worker n'avait pas enregistré cette confirmation
localement. Aucun état source n'a été corrigé artificiellement. Le parcours de
reprise existant exige la confirmation idempotente avant une nouvelle réservation.

## Limites

- Le test HTTP du contrôleur utilise une identité de fixture : pas de nouveau
  parcours navigateur/OIDC complet ni de relance du lot client.
- Lecture QR validée ; parcours RSVP/check-in après scan non exécuté.
- Le PDF reproduit le snapshot enregistré ; sa complétude éditoriale n'est pas
  modifiée ni certifiée par ce diagnostic.
- Le stack `background.js` fourni pour `/site_integration/template_list` désigne
  une extension ; son exécution dans le navigateur n'a pas été inspectée ici.
  Aucune permission applicative changée pour la masquer.
- Aucun appel IA payant, reset, purge, suppression de volume, commit ou push.


## Incident supplémentaire : GET batches HTTP 500

Lot du 12/10 à 16:15:11 Kinshasa : `4c6105b9-e22f-42df-8146-7e8ac541faef`.
La base confirme COMPLETED, 1/1, settledAt `2026-10-12T15:15:32.793Z`.
Wallet : une réservation de 1, une seule consommation confirmée de 1, libération 0.
Aucune écriture financière ou nouvelle émission effectuée pour cette réparation.

Exception Invitations observée dans les logs du GET :
`TypeError: Do not know how to serialize a BigInt`, dans Fastify reply.js/JSON.stringify.
Gateway propageait le 500 ; l'interface conservait implicitement son ancien état
« Confirmation financière ». Ce n'était pas un règlement bloqué.

Correction ciblée de list (avec et sans pagination) et getBatch : convertir
uniquement zipSizeBytes en chaîne décimale, ou null. Aucun Number(BigInt), aucune
modification globale du sérialiseur et aucune liste vide de remplacement.

Polling Web : conserver la dernière réponse valide, afficher
« Actualisation impossible », attendre 10/20/40/60 secondes après les erreurs,
revenir à 5 secondes après succès, annuler les requêtes au démontage et empêcher
le chevauchement des tentatives automatiques. Actualiser déclenche seulement la
lecture des lots, sans remettre à zéro le formulaire ni ses sélections.

Images invitations/rendering/web reconstruites et conteneurs recréés de façon
ciblée. Tests : 12 Invitations et 4 Web réussis ; typechecks Web/Invitations et
lint ciblé réussis ; build Docker réussi ; git diff --check réussi. Windows a
nécessité une exécution hors sandbox pour esbuild spawn EPERM.

Contrôle réel en lecture seule, dans le conteneur Invitations : vrai Prisma,
vraie base, vrai service/contrôleur et sérialisation HTTP Fastify, avec identité de
fixture explicitement injectée dans le test (pas de simulation des données).
GET liste 200 avec 4 vrais lots ; détail 200 ; lot COMPLETED financé. ZIP lu :
24 047 575 octets ; PDF lu : 24 047 401 octets, signatures PK/%PDF- vérifiées.
Autre propriétaire refusé. Le test n'a créé ni lot, ni session, ni débit.

Limite : le GET public Web via la session navigateur et l'affichage authentifié
n'ont pas encore été validés dans cette passe. L'onglet intégré est arrivé sur
la connexion Keycloak et attend une connexion normale. La revue automatique a
refusé un diagnostic proposant d'extraire les tokens depuis Redis ; il n'a pas
été exécuté. Aucune protection d'authentification n'a été modifiée.
