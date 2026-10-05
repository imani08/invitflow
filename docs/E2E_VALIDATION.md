# Phase 9 — validation E2E préproduction

Date de la revue : 5 octobre 2026. Cette matrice part de l’état présent du dépôt. Aucun environnement Docker, navigateur connecté aux services, tunnel public ou paiement EasyPay n’a été exécuté pendant cette passe. Les tests automatisés démontrent le comportement couvert par leurs fixtures uniquement et ne sont pas présentés comme un parcours E2E.

## Synthèse de disponibilité

- `docker info` et `docker compose ps --all` échouent avec `permission denied` sur `npipe:////./pipe/dockerDesktopLinuxEngine`. Aucun service Docker n’a pu être démarré ou interrogé; état runtime et health : inconnus.
- Le fichier `.env` existe et ses secrets principaux PostgreSQL, RabbitMQ, Redis, MinIO et Keycloak sont configurés. Les contrôles n’affichent aucune valeur. `STORAGE_MONITOR_TOKEN` et `MINIO_STORAGE_AUDIT_SECRET_KEY` sont absents; Compose exige ces variables. EasyPay CID/token/IPN sont absents; aucune transaction sandbox n’est possible.
- Les migrations ne sont pas examinées dans des bases vivantes et n’ont pas été appliquées dans cette passe. Historique documenté antérieur : migrations additives de stockage Media/Invitations et diverses migrations antérieures n’ont pas été appliquées à cause de l’indisponibilité Docker. La migration Payments Phase 8 `20261005120000_easypay_provider_references` est présente mais non appliquée/vérifiée.
- Ne pas exécuter `docker compose down -v` ni `prisma migrate reset`. Générer les deux secrets locaux manquants avec des secrets distincts, ajouter les identifiants marchands sandbox reçus hors Git, puis reprendre quand Docker Desktop est disponible.

## Matrice de validation

| FLOW | STATUS | ENVIRONMENT | EVIDENCE | ISSUE | NEXT ACTION |
| --- | --- | --- | --- | --- | --- |
| Dépôt / modifications | PARTIAL | Git local | `git status`, `git diff --stat`, `git diff` inspectés; arbre déjà très modifié par travaux précédents et Phase 8. | Modifications métier antérieures intentionnelles, fichiers générés Prisma et `apps/web/tsconfig.tsbuildinfo` présents. | Préserver les changements préexistants; isoler/revoir les fichiers générés avant tout nettoyage. |
| Configuration Compose | PARTIAL | `.env` local, valeurs masquées | Contrôle de présence uniquement : secrets de base principaux configurés; `STORAGE_MONITOR_TOKEN` et `MINIO_STORAGE_AUDIT_SECRET_KEY` absents; EasyPay CID/token/IPN absents. | Le Compose exige le token stockage et les identifiants MinIO audit. | Compléter ces variables localement avec des secrets aléatoires distincts; obtenir les identifiants EasyPay sandbox. |
| Docker / services / health | BLOCKED | Docker Desktop Windows | `docker info` et `docker compose ps --all`: `permission denied` sur le named pipe. | Impossible de démarrer ou inspecter le runtime. Aucun état service/health n’est revendiqué. | Rendre Docker Desktop accessible, puis lancer `docker compose config --quiet`, `docker compose up -d`, `docker compose ps --all` et inspecter logs/health de chaque service. |
| Migrations par base | BLOCKED | PostgreSQL Docker indisponible | Historique migrations inspecté dans docs; pas de connexion DB cette passe. | Impossible de distinguer appliquée/en attente/divergente dans une base réelle. Payments Phase 8 est sans preuve d’application. | Lorsque DB accessibles, exécuter `prisma migrate status`/`migrate deploy` pour chaque service DB, un par un, consigner l’historique et les erreurs. Aucun reset. |
| Keycloak / OIDC / callback / refresh / logout | NOT TESTED | Pas de navigateur/runtime | Parcours décrit et tests utilitaires Web existants; aucun aller-retour Keycloak exécuté. | Session, PKCE et risque de boucle callback non démontrés runtime. | Tester inscription si activée, login, callback, accès protégé, refresh/expiration et logout dans navigateur avec logs corrélés. |
| Event / cérémonies / invités / seating | NOT TESTED | Pas de DB/API runtime | Tests unitaires ciblés existent pour Events, Guests et Seating; aucun compte multi-utilisateur ni parcours API exécuté. | Isolation inter-comptes et persistance runtime non démontrées. | Parcours authentifié multi-utilisateur, vérifier changement de table dans l’invitation. |
| Media upload / MinIO / preview / réutilisation | NOT TESTED | Pas de MinIO/API runtime | Contrats et tests unitaires existent; aucun JPEG/PNG/WebP uploadé en environnement intégré. | Transfert binaire, metadata, signed preview et références réelles non vérifiés. | Tester JPEG, PNG alpha, WebP si activé, portrait/paysage jusqu’à réutilisation dans Design. |
| rembg / détourage | NOT TESTED | Runtime absent | Aucun processus rembg exécuté pendant la phase. | Disponibilité réelle et asset transparent dérivé inconnus. | Vérifier configuration/health rembg; si absent, conserver ce flux NOT TESTED/BLOCKED sans bloquer les autres parcours. |
| AI Design Composer | NOT TESTED | Pas de navigateur/API/DB runtime | Les règles Composer et tests de service antérieurs sont documentés, sans E2E actuel. | Avec/sans photo, 1/4 cérémonies, batch/diversité, Version 1 et reprise après refresh non prouvés ensemble. | Exécuter cas contrôlés et vérifier qu’aucune proposition non choisie n’est persistée. |
| Editorial Assist | PARTIAL | Tests workflow / provider non runtime | Workflow éditorial et tests unitaires antérieurs documentés; provider de production pas configuré/qualifié. | Qualité linguistique du vrai provider NON TESTÉE. | Tester texte dense jusqu’à acceptation, nouvelle version, resolver et invitation finale; noter provider local/mock et limites. |
| Templates / variantes | PARTIAL | Fixtures et rendus antérieurs locaux | QA antérieure couvre plusieurs familles et templates; pas toute la matrice six templates × variantes Phase 9 dans ce runtime. | Noms longs, multi-cérémonies, QR, tables et combinaisons photo/no-photo non validés en système connecté. | Générer les cas minimum demandés avec données synthétiques contrôlées. |
| Web preview vs PDF Chromium/Linux | NOT TESTED | Worker Docker inaccessible | Mesures historiques Windows et documentées ne sont pas une comparaison Chromium/Linux de cette phase. | Écarts Linux, photos/masques, multi-cérémonies et texte dense inconnus. | Rendre mêmes snapshots en Web et PDF Linux, comparer dimensions/layout/overflows et mesurer les écarts significatifs. |
| Invitation → snapshot → PDF → MinIO → téléchargement | NOT TESTED | Invitations/Rendering/MinIO indisponibles | Architecture et tests unitaires antérieurs existent; aucun PDF authentifié produit cette passe. | Déterminisme et lecture réelle de l’objet stocké non prouvés. | Créer invitation réelle depuis Design choisi, rendre PDF, comparer snapshot et télécharger depuis MinIO. |
| Batch / ZIP / expiration / cleanup | NOT TESTED | Pas de RabbitMQ/DB/MinIO | Aucun batch runtime exécuté. | ZIP, récupération et nettoyage expiré non démontrés. | Tester petit lot, comparer nombre d’invitations/PDF et récupérer ZIP; examiner cleanup borné. |
| Billing / Wallet / crédits | PARTIAL | Tests unitaires, pas de runtime | Tests Payments couvrent quote Billing et snapshot; ancienne doc recense tests Billing/Wallet. Aucun achat inter-service exécuté. | Réservation/crédit runtime et refus avant réservation non prouvés dans DB/RabbitMQ. | Tester preview/édition/Composer sans coût puis génération finale et validation refusée; vérifier ledger exact. |
| EasyPay sandbox / IPN / checking-status | BLOCKED | Sandbox non configuré | Les paramètres EasyPay sont absents; tunnel public impossible sans endpoint accessible. Phase 8 contient 5 tests adaptateur mockés, pas un test réseau marchand. | Contrat API et transaction réelle inconnus; aucun crédit prouvé. | Après accès Docker et paramètres marchands sandbox, exposer uniquement Gateway par tunnel TLS, configurer IPN, confirmer méthode/champs/statuts et effectuer un paiement sandbox. |
| Idempotence et callback malveillant | PARTIAL | Tests unitaires + protections de code, pas concurrence runtime | Le flux vérifie le statut serveur et compare référence/montant/devise; tests EasyPay valident parsing/status mapping. | Doublons IPN + page succès simultanés, mismatches et crédit simple non testés de bout en bout. | Tester doublons et simultanéité; faux statut, montant/devise erronés et référence inconnue ne doivent produire aucun ledger Wallet. |
| QR / RSVP / check-in / accès cérémonies | NOT TESTED | Pas d’API runtime | Pas de scan réel ni d’API Guest runtime. | Unicité du QR, RSVP répété, double entrée et permissions cérémonie non vérifiés. | Scanner QR d’invitation réelle, vérifier invité/événement, règles seconde réponse et anti-double entrée; tenter accès à cérémonie interdite. |
| Storage inventory / suppression référencée / cleanup | PARTIAL | Tests locaux antérieurs, pas de MinIO | Docs antérieures décrivent snapshots et comportement fail-closed; race `UNREFERENCED`→nouvelle référence identifiée. | Token monitor et compte audit absents; course concurrente subsiste sans lease inter-service. | Configurer les deux secrets, vérifier référence/inconnu/interruption runtime; garder la suppression conservatrice. |
| Agency | NOT TESTED | Pas d’auth/API runtime | La fonctionnalité existe partiellement; période/quota/membres ont des limites déjà documentées. | Isolation et permissions ne sont pas E2E vérifiées. | Tester seulement les opérations fonctionnelles présentes avec deux workspaces. |
| Partner | PARTIAL | Tests unitaires Payments, pas runtime | Tests commission/idempotence historiques présents; les payouts `PAID` restent bloqués sans vérificateur externe confirmé. | Attribution → paiement → commission et reversement sans runtime; aucun fournisseur payout. | Tester attribution/commission dans runtime; conserver le blocage `PAID` tant qu’aucune confirmation réelle n’existe. |
| Mobile / thème / accessibilité | NOT TESTED | Pas de navigateur intégré | Aucun viewport mobile/light-dark ni contrôle clavier exécuté. | Overflow, focus, contraste, modales et touch targets inconnus. | Parcourir login, event, Composer, paiement, invitation en 375 px et thème clair/sombre; vérifier clavier/labels/focus. |
| Authorization inter-utilisateurs | NOT TESTED | Pas de deux sessions/API runtime | Quelques routes sont owner-scoped par code, mais aucun test API croisé A/B exécuté dans cette passe. | Les accès Events/Guest/Design/Payment/Media/Invitation de B par A ne sont pas démontrés. | Obtenir deux identités, appeler directement chaque API avec l’ID de B et vérifier refus sans fuite. |
| Validation d’entrées / logs / erreurs | PARTIAL | Tests unitaires et inspection statique | L’adaptateur EasyPay borne références/réponses; validation upload et erreurs couvertes partiellement par tests antérieurs. | Multipart trop grand, JSON malformé, IDOR et corrélation request→Rabbit→résultat non runtime. | Tester les entrées hostiles prescrites et vérifier réponses sans stack trace/PII/secrets; suivre un job asynchrone. |
| RabbitMQ / outbox / inbox / restart | NOT TESTED | RabbitMQ Docker indisponible | Outbox et consommateur idempotent existent par conception/tests unitaires antérieurs. Aucun publish/retry/redémarrage runtime. | Livraison, retry, double effet, persistance après restart inconnus. | Exécuter un job asynchrone, simuler redémarrage raisonnable et vérifier outbox/ledger/snapshots restent cohérents. |
| Tests automatisés Phase 9 | PARTIAL | Tests locaux | Payments 18/18, incluant les 5 tests EasyPay; typechecks Payments/Gateway/Web et lint ciblé Payments ont passé dans la passe précédente. | Les suites complètes DesignDocument, Designs, AI Design, Billing, Wallet, Invitations et Media n’ont pas été relancées dans cette passe; aucune suite E2E. | Relancer suites ciblées après disponibilité deps/runtime; distinguer tests unitaires et navigateur/E2E. |
| Production readiness | BLOCKED | Préproduction non validée | Docker inaccessible, migrations runtime inconnues, EasyPay sandbox non configuré et tests clés authorization/PDF/Wallet non effectués. | Lancement ne peut pas être déclaré sûr. | Lever les bloqueurs ci-dessus et remplir les lignes de matrice avec une preuve de runtime reproductible. |

## Matrice Docker

État de chaque conteneur : **inconnu**, car le daemon n’a pas permis `docker compose ps`. Cette table ne suppose pas qu’un service est arrêté ou en échec.

| SERVICE / groupe | STATUS | PORT Compose usuel | HEALTH | NOTES |
| --- | --- | --- | --- | --- |
| PostgreSQL (bases isolées par service) | BLOCKED | 5432 | Inconnu | Aucun état conteneur/DB ou migration lisible. |
| RabbitMQ / management | BLOCKED | 5672 / 15672 | Inconnu | Messaging et workflows async non testés. |
| Redis | BLOCKED | 6379 | Inconnu | Sessions/cache runtime non vérifiés. |
| MinIO / bootstrap | BLOCKED | 9000 / 9001 | Inconnu | Buckets, credentials audit et objets non vérifiés. |
| Keycloak | BLOCKED | 8080 | Inconnu | OIDC non exécuté. |
| Profile, Events, Guests, Seating, Designs, AI Design | BLOCKED | Ports internes Compose | Inconnu | Pas d’API runtime. |
| Media, Billing, Wallet, Payments | BLOCKED | Ports internes Compose | Inconnu | Migrations et flux inter-service non vérifiés. |
| Invitations, Rendering worker | BLOCKED | Ports internes Compose | Inconnu | Aucun PDF/ZIP rendu ou téléchargé. |
| Gateway / Web | BLOCKED | 3002 / 3000 | Inconnu | Aucun navigateur ou endpoint local vérifié. |
| rembg / observabilité / autres profils | NOT TESTED | Selon service/profil | Inconnu | Configurations dépendantes du profil et de l’environnement. |

Les ports sont des ports attendus par la configuration du dépôt, pas une mesure de sockets ouverts. Voir `compose.yaml` pour les ports et profils exacts de chaque service.

## PRODUCTION BLOCKERS

1. Docker Desktop/runtime intégré inaccessible; aucun health check ni état migrations démontré.
2. `STORAGE_MONITOR_TOKEN` et `MINIO_STORAGE_AUDIT_SECRET_KEY` manquent au `.env`; les services dépendants ne peuvent pas être correctement évalués.
3. EasyPay sandbox non configuré (CID/token/IPN publics absents) et contrat checking-status/champs encore à confirmer. Aucun paiement sandbox, IPN ou crédit Wallet vérifié.
4. Les tests critiques d’autorisation entre deux utilisateurs, PDF/ZIP persisté, outbox/consumer, crédits runtime, RSVP/check-in et restart n’ont pas été exécutés.

## Éléments non bloquants à distinguer

- Différences pixel mineures historiques ne sont pas considérées comme blocage seules si structure, contenu, lisibilité et zones sûres restent cohérents; cette Phase 9 n’a pas mesuré Linux.
- Analytics produit, enrichissement du catalogue template et optimisations futures ne sont pas évalués comme bloqueurs par cette matrice.
- La race de suppression Storage entre lecture `UNREFERENCED` et nouvelle référence demeure une limite connue; maintenir l’échec fermé et la purge conservatrice jusqu’à protocole sûr.
- La qualité linguistique du provider IA de production est non testée; elle est séparée de la correction mécanique du workflow éditorial.

## Suites locales rapportées

- Phase 8 : Payments 18/18 (tests unitaires avec provider fetch mocké), typechecks Payments, Gateway, Web et ESLint ciblé Payments passés; `git diff --check` passait à la clôture de cette passe.
- Aucun résultat ci-dessus ne constitue une validation E2E avec vrais services.
