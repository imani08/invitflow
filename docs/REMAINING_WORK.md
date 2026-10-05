# InvitaFlow — reste à faire des 12 phases

## Statut global — PARTIAL

Après le travail Access du 01/10/2026, le typecheck global passe (18 tâches locales dont Access) et Access compile. Media décode, scanne avec ClamAV avant le décodage, réencode et publie trois variantes WebP; ses tests de protocole antivirus, transcodage, présignature et sélection owner-scoped passent sous Node 26 ainsi que son typecheck et lint. L’intégration du scanner, MinIO et DB reste à valider en runtime. Les routes Access et affectations d’agents existent mais migrations/runtime/concurrence restent à valider; Analytics doit être validé en runtime; plusieurs parcours privacy/commerciaux manquent, et Docker, intégration et E2E ne sont pas validés.

### Alignement Node.js — revalidation 02/10/2026

- Politique adoptée: développement Node.js 26.10.0; production Node.js 24.21.0 LTS; plage `>=24 <27`; CI sur les deux versions. `.nvmrc`, `.node-version`, les manifests, Compose et README sont alignés.
- pnpm `12.8.0` est épinglé dans `package.json`, installé globalement par npm et ne requiert pas Corepack. Le 01/10/2026, `pnpm install --frozen-lockfile --offline` passe sous Node 26, confirme que le lockfile est à jour et n’installe aucun paquet. pnpm exécute ses scripts de préparation depuis le store local. `HTTP_PROXY`, `HTTPS_PROXY` et `ALL_PROXY` pointent vers `http://127.0.0.1:9`; les configs proxy npm/pnpm sont vides. L’installation hors ligne n’a pas besoin du proxy et aucune config système n’a été changée.
- Revalidation locale le 01/10/2026 sous Node `v26.10.0` / pnpm `12.8.0`: `pnpm check:workspace` passe (21 workspaces); lint forcé passe (18 tâches, avertissements seulement); typecheck forcé passe (18 tâches); tests forcés passent (13 tâches Turbo), puis les 21 tests Node natifs des scripts backup/restore et de Media passent; build forcé passe (18 tâches, dont Web et Admin). Les exécutions qui lancent des processus enfants ont nécessité une exécution hors sandbox après `spawn EPERM` dans l’isolation Windows.
- Prisma 7.10.0: `prisma -v` et `prisma generate` passent sous Node 26.10.0 et le build/typecheck régénèrent le client dans les services. Toutefois, le script `preinstall` de Prisma affiche explicitement un avertissement limitant son support officiel à Node 20, 22 et 24; Node 26 fonctionne lors de ces vérifications, mais cette version de Prisma ne le certifie pas. Aucune mise à niveau majeure vers une préversion n’a été faite.
- `docker compose --env-file .env.example config --quiet` passe. Le client Docker est présent, mais le moteur Docker Desktop renvoie `permission denied` sur son named pipe; aucun build d’image Node 24 n’a donc été exécuté. La CI distante n’a pas encore été exécutée. Les Dockerfiles par défaut restent sur `node:24.21.0-slim` et Compose passe `node:26.10.0-slim` en build-arg aux services applicatifs de développement; le conteneur d’initialisation d’audience Keycloak reste sur Node 24.21.0. Aucune validation d’exécution Node 24 n’est revendiquée.
- Revalidation du 02/10/2026: `node -v` confirme `v26.10.0`, `.nvmrc` et `.node-version` valent `26.10.0`, `package.json` épingle `pnpm@12.8.0` et `>=24 <27`, et `docker compose --env-file .env.example config --quiet` passe. Le `pnpm install --frozen-lockfile --offline` courant est bloqué avant toute écriture par `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK` (accès refusé au verrou du store dans `%LOCALAPPDATA%`); la tentative avec un store local n’a pas déplacé ce verrou. `pnpm check:workspace`, lint, typecheck, tests et build ne sont donc pas relancés cette fois. Les succès du 01/10/2026 ci-dessus restent les validations les plus récentes de ces scripts; aucun paquet n’a été installé dans cette revalidation.
- Nouvelle vérification du 02/10/2026 après cette note: versions locales Node `v26.10.0`, npm `11.19.1`, pnpm `12.8.0`; `pnpm check:workspace`, lint, typecheck, tests et build passent (18 tâches build/typecheck, 14 tests Turbo et 21 tests Node natifs; lint avec avertissements existants). Les tests/build ont dû être relancés hors sandbox après `spawn EPERM` dans l’isolation Windows. `pnpm install --frozen-lockfile --offline` reste bloqué par le verrou global du store (ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK), donc aucun paquet n’a été installé. Compose valide sa configuration. `docker version` reconnaît le client mais l’accès au moteur Desktop échoue sur son named pipe (`permission denied`): build d’image et validation Node 24 runtime toujours `BLOCKED_ENVIRONMENT (runtime Docker)`. Proxy npm/pnpm vide; variables `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` pointent vers `http://127.0.0.1:9`; elles n’ont pas été modifiées.

État réévalué le 01 octobre 2026 en comparant le code présent au prompt maître et au cahier des charges v1.0 (122 pages PDF physiques, pagination imprimée jusqu’à 87, puis complément Design Engine portant les exigences jusqu’au numéro 310). Les mentions de phase « implémentée » dans le README désignent parfois un premier parcours de domaine; elles ne signifient pas que les critères de mise en production, de tests et d’exploitation sont satisfaits.

Statuts : `DONE` signifie critères vérifiés; `PARTIAL` signifie qu’une partie existe, mais qu’il reste des écarts; `NOT_STARTED` signifie qu’aucun parcours réel n’est présent; `BLOCKED_ENVIRONMENT` et `BLOCKED_EXTERNAL` identifient uniquement la validation ou la décision impossible localement. Aucun statut `DONE` n’est revendiqué pour une phase entière à cette date.

## Phase 0 — Foundation — PARTIAL

- **Services incomplets :** `services/media` a un schéma Prisma/migration, des routes BFF/Gateway, des URL POST S3 limitées, des contrôles propriétaire, une zone MinIO privée et purge. Il valide le contenu, utilise ClamAV `INSTREAM` avant le décodage (échec fermé), décode les pixels avec Sharp, applique l’orientation, redimensionne et réencode en WebP sans métadonnées en trois tailles (original 4096 px, preview 1280 px, miniature 320 px) avant publication en état `READY`; `READY` n’est persisté qu’après les trois publications et les téléchargements acceptent seulement ces variantes fixes. Sharp `0.35.5` est déclaré et son entrée réutilise la résolution déjà présente au lockfile. Tests antivirus/transcodage/présignature, sélection owner-scoped des variantes, typecheck et lint Media passent sous Node 26; l’intégration ClamAV/MinIO/PostgreSQL reste à valider. Restent l’accès workspace/événement et l’intégration aux éditeurs. `services/access` a désormais les modèles/migration, API d’affectation/révocation par cérémonie, contrôle d’accès owner/agent, proxy Gateway, délégation interne protégée vers Invitations, journalisation des scans expurgée, outbox et contexte scanner Web. Invitations reste la source canonique de validation QR et du pointage atomique. Manquent PWA/offline, UX annuaire d’agents, tests d’intégration/concurrence, validation des migrations/runtime. `services/analytics` a les projections journalières idempotentes, un consommateur AMQP à ack manuel avec prélecture bornée, l’ack après transaction et publication persistante confirmée vers retry/DLQ avant acquittement; les messages invalides partent en DLQ. Les tests unitaires couvrent l’ordre commit/ack, retries et messages non routés. Runtime, migrations et agrégats restent à valider avec RabbitMQ/PostgreSQL. `apps/admin` fournit un accueil de navigation responsive; la plupart des domaines n’ont pas encore de vues ou API dédiées.
- **Observabilité partielle :** le Gateway expose maintenant compteurs HTTP et histogrammes Prometheus à cardinalité bornée; RabbitMQ expose les métriques fines de profondeur et consommateurs par file via son plugin Prometheus intégré. Les profiles `observability` ajoutent les exporters PostgreSQL `v0.20.1` (login dédié `pg_monitor`) et Redis `v1.89.0` (ACL `exporter` dédiée). Prometheus scrape Gateway, RabbitMQ, PostgreSQL et Redis en réseaux privés. Les alertes couvrent indisponibilité/échec de collecte, saturation PostgreSQL (80 %/95 %) et indisponibilité Redis/exporter; Grafana montre connexions PostgreSQL, disponibilité DB et Redis, ratio de hits, mémoire et clients Redis, latence Gateway et backlog/DLQ. Les SDK OpenTelemetry dans les services, contexte W3C trace/span et propagation HTTP/RabbitMQ, métriques CPU/RAM/disque, métriques métier, Alertmanager/destinations de notification et validation runtime restent absents.
- Le Collector expose ses métriques internes et convertit les métriques OTLP en endpoint Prometheus; Prometheus scrape ces deux endpoints, Gateway, RabbitMQ `/metrics/detailed` (familles queue coarse/consommateurs, vhost `/`) et PostgreSQL sur le réseau privé `metrics`. Aucun de ces endpoints exporters n’est publié sur l’hôte. Le Gateway n’exporte pas encore OTLP, et les autres applications ne sont pas instrumentées.
- Les alertes p95/5xx Gateway et RabbitMQ, la saturation de connexions PostgreSQL et l’indisponibilité Redis sont configurées. Paiements et ressources CPU/RAM/disque restent sans métriques/alertes dédiées; aucun Alertmanager n’achemine les alertes. Les règles et images exporters sont déclarées en CI mais doivent encore être validées par un runner GitHub et un runtime Docker.
- Le Gateway expose `GET /metrics` avec compteurs de requêtes et histogrammes de durée; les labels sont la méthode HTTP allowlistée, le modèle de route Fastify borné (les chemins arbitraires deviennent `unknown`) et le code de statut, sans ID utilisateur ni query string. Trois tests couvrent l’export, les buckets, la normalisation et les limites de route. Les 22 appels proxy sortants transmettent `x-request-id` et `x-correlation-id` validés; trois tests couvrent le contexte. Cela ne remplace pas la création ni l’export de spans OpenTelemetry.
- Web et Admin génèrent chacun un nonce CSP par requête HTML et transmettent la politique à Next.js pour nonce ses scripts; Admin rend ses pages dynamiquement pour que les scripts statiques reçoivent aussi le nonce. Les CSP interdisent les scripts inline non autorisés, objets et iframes. HSTS `max-age=31536000` s’ajoute aux autres en-têtes. Trois tests couvrent chaque politique. Les deux builds locaux ont répondu 200 avec CSP/HSTS et un nonce HTML égal au nonce CSP. Aucune injection navigateur/DAST n’a été exécutée.
- Une CI GitHub Actions est ajoutée pour valider la configuration Compose/Prometheus/règles d’alerte, lancer lint, types, tests et build sur Node 24.21.0 et 26.10.0 via `actions/setup-node@v7` et installation explicite de pnpm 12.8.0, audit de dépendances, SBOM CycloneDX, Gitleaks, Semgrep, Trivy filesystem, builds et scans des 18 Dockerfiles actuels ainsi que des images ClamAV, RabbitMQ, Prometheus et PostgreSQL exporter. Les workflows distants ne sont pas exécutés; l’infrastructure GitHub et les résultats des scans restent à valider.
- Scripts `pnpm db:backup` / `pnpm db:restore` et procédure PostgreSQL/MinIO ajoutés. Le dump/restore réel et le contrôle des objets restent `BLOCKED_ENVIRONMENT (runtime Docker)`; aucun backup n’est annoncé comme validé.
- Le backup PostgreSQL préserve maintenant les fichiers déjà existants en cas de collision de nom; deux tests vérifient cette protection et le nettoyage d’un dump incomplet après échec.
- La restauration transmet maintenant `RESTORE_TARGET_URL` à Docker par nom de variable hérité du processus, sans placer l’URL ou son mot de passe dans les arguments de commande. La cible doit utiliser `postgres://`/`postgresql://`, spécifier un hôte et une base, et les hôtes Compose `postgres` et loopback sont refusés; les paramètres d’URL qui pourraient remplacer hôte, base ou utilisateur sont aussi refusés. Quatre tests couvrent les arguments et la validation de cible.
- Les erreurs TypeScript découvertes dans Invitations, Guests et Seating ont été corrigées. Le typecheck global et le build de toutes les workspaces existantes passent sous Node 24.19.0.
- Les tests unitaires couvrent le parsing CSV invité, les préfixes d’injection de formules, dates/fuseaux Events, métriques Gateway, export de profil/compte, concurrence du renouvellement OIDC, sauvegarde/restauration PostgreSQL, pagination propriétaire Payments/Invitations, préflight image Media, protocole ClamAV simulé, décodage/réencodage WebP avec bornes de variantes, politique d’upload S3 et URL de téléchargement SigV4 (signature recalculée indépendamment), ainsi que les signatures des jetons d’invitation. Les huit tests Media de préflight, transcodage et présignature passent sous Node 26 avec `node --test --test-isolation=none`; deux tests Media supplémentaires vérifient la génération des liens owner-scoped et le rejet des variantes arbitraires; trois tests antivirus couvrent les frames, réponses clean/infected et erreurs. Le typecheck Media passe aussi. Le mode isolé par défaut échoue dans le sandbox (`spawn EPERM`). Les deux tests FlexPay vérifient l’échec fermé du provider et sa configuration, sans appeler le fournisseur. La plupart des packages n’ont toujours pas de tests automatisés.
- `.dockerignore` exclut maintenant les fichiers d’environnement, dépendances locales et artefacts du contexte Docker; cela évite d’envoyer les `.env` aux builds qui copient le contexte entier.
- Keycloak local est maintenant raccordé à `keycloak_db` avec un rôle isolé. Un job Compose idempotent provisionne aussi les volumes Postgres existants; reste à démarrer l’environnement et valider inscription/login/MFA.
- **Sécurité/exploitation :** les applications Node sauf le worker Chromium héritent maintenant de `init`, `no-new-privileges`, `cap_drop: ALL` et `pids_limit: 256`; l’exporter PostgreSQL dépose aussi ses capabilities et limite ses processus. Prometheus, Grafana, Loki, Tempo, Collector et exporter PostgreSQL sont activables avec le profile Compose `observability`. Les conteneurs de données/tiers et le worker Chromium ne sont pas inclus dans ces restrictions; filesystems read-only et limites CPU/mémoire restent à traiter et valider en runtime. Les scripts de backup/restore existent, mais aucun exercice réel n’a été validé.
- Le dashboard/API Traefik en mode insecure et son port local `8088` ont été retirés: aucun besoin de fonctionnement local ne les justifie, et le mode insecure expose son API sans authentification aux processus capables d’atteindre le port loopback. Traefik garde seulement son entrypoint HTTP local `127.0.0.1:80`; la configuration Compose passe après ce retrait.
- **Qualité du socle :** lint, typecheck, tests et build passent localement sous Node 26, mais la couverture reste inégale. Analytics, Guests et Seating ont respectivement 10, 14 et 7 tests; Gateway en a maintenant 6 et Admin 3. Les tests OIDC vérifient les scripts Redis via un faux client, pas contre Redis réel. Pas de tests contractuels ou E2E; environnement complet et healthchecks jamais validés ensemble. Le workflow CI est créé mais doit encore être exécuté dans GitHub Actions.
- `pnpm install --frozen-lockfile` a été exécuté sous Node 24.19.0 / pnpm 10.18.2. Le premier téléchargement a nécessité l’accès réseau approuvé, notamment pour les moteurs Prisma; les scripts de lifecycle non listés explicitement sont bloqués par pnpm.
- L’audit npm de production, lancé avec accès registre, a d’abord révélé 14 vulnérabilités hautes et 12 modérées. Les dépendances ont été corrigées dans leurs versions compatibles (NestJS 11.2.4, Fastify 5.12.1 et overrides transitifs); le second audit rapporte `No known vulnerabilities found`.
- **Packages partagés :** `contracts`, `ui` et `observability` ne couvrent qu’une petite partie des contrats, composants et intégrations prévus.

## Phase 1 — Identity / Profile — PARTIAL

- Le parcours d’inscription/connexion OIDC, session BFF et profil de base existe, mais n’a pas été compilé ni testé en E2E sur un Keycloak opérationnel.
- Le renouvellement d’accès utilise maintenant un verrou Redis à durée limitée et des écritures/suppressions conditionnelles; une requête concurrente périmée ne peut plus remplacer ou effacer une session renouvelée. Six tests unitaires couvrent les opérations conditionnelles, la propriété du verrou et l’attente des requêtes concurrentes. Le comportement des scripts avec la vraie version/configuration Redis et le parcours Keycloak restent à valider en runtime.
- MFA renforcée par rôle admin et vérification du parcours MFA restent à configurer et valider.
- L’export JSON couvre maintenant le profil, les événements, invités, placements, designs et versions (y compris archivés), lots d’invitations et leurs items, portefeuille/ledger, paiements, notifications/préférences et métadonnées Media. Les appels sont authentifiés et owner-scoped par les services; les curseurs répétitifs, pages invalides, sources indisponibles et exports de plus de 20 Mio échouent au lieu de retourner un export partiel. Les objets binaires PDF/ZIP, les octets des médias originaux et les fichiers/jobs d’import historiques ne sont pas inclus; certaines données d’import ne disposent pas encore d’API de liste.
- Le Profil sait maintenant enregistrer une demande authentifiée de suppression, la rendre consultable/annulable, et publier les événements `profile.account_deletion.requested.v1` / `cancelled.v1` via son outbox transactionnel; l’interface expose le statut et précise que l’enregistrement n’efface rien immédiatement. L’orchestrateur et les consommateurs de suppression/anonymisation des services propriétaires n’existent pas encore: aucune demande n’est donc présentée comme exécutée. Rétention configurable, preuve de vérification renforcée et gestion des consentements marketing restent à faire. Les durées de conservation, les obligations de facture/taxe et le texte juridique sont `BLOCKED_EXTERNAL` en attente des informations réelles et de la validation professionnelle.
- À l’annulation, la même valeur `cancelledAt` est maintenant utilisée pour la mise à jour SQL et le payload d’outbox; un test couvre leur égalité. Le lint Profile passe le 02/10/2026. L’exécution du test reste `BLOCKED_ENVIRONMENT (création de processus)` dans cette session Windows (`tsx`/esbuild échoue avec `spawn EPERM`), sans échec d’assertion observé.
- L’interface Web ne marque plus une demande `CANCELLED` quand le serveur répond qu’aucune demande pending n’a été annulée; elle affiche le résultat réel. Typecheck Web et lint ciblé passent le 02/10/2026. Aucun test DOM n’existe dans ce workspace; ajouter son infrastructure attend les dépendances autorisées.
- Le parcours compte maintenant le chargement du statut de suppression comme prérequis: pendant le chargement, ou si l’API échoue, l’interface indique l’état et n’autorise pas une nouvelle demande/annulation sur une hypothèse périmée. Lint ciblé et typecheck Web repassent le 02/10/2026. Le workflow d’effacement/anonymisation interservices demeure absent et `BLOCKED_EXTERNAL` sur les règles de rétention/comptabilité.
- Les BFF Profil, suppression et déconnexion partagent désormais une validation d’origine exacte HTTP(S); trois tests natifs passent sur l’origine attendue, l’absence/cross-site/URL mal formée et une configuration invalide. Dans cette passe, lint/typecheck workspace n’ont pas fourni de résultat: les commandes sont restées silencieuses dans l’isolation Windows et ont été interrompues. Aucun paquet n’a été installé.
- Les API d’historique des paiements et lots d’invitations ainsi que les métadonnées Media offrent une pagination stable par curseur, limitée au propriétaire; les écrans courants n’affichent toujours que les premières pages.
- Pas de gestion d’équipes, invitations de collaborateurs ou rôles par événement.

## Phase 2 — Events — PARTIAL

- Création d’événements et cérémonies multi-cérémonies existe avec fuseaux horaires. L’API rejette maintenant les dates calendaires impossibles, exige un offset explicite et vérifie que l’heure locale et l’offset correspondent au fuseau déclaré. Les heures inexistantes au changement d’heure sont rejetées; les deux occurrences d’une heure répétée sont possibles lorsqu’elles portent leur offset explicite. Quatre tests couvrent ces validations et le build/typecheck Events passe.
- La modification de l’événement et des cérémonies, ainsi que publication/ajout/retrait, verrouillent la ligne parent de l’événement dans PostgreSQL avant de valider et écrire; publication utilise aussi une transition conditionnelle `DRAFT → PUBLISHED` filtrée par propriétaire. Cela sérialise les changements de dates et les mutations concurrentes de cérémonies au sein du service Events. Les scénarios restent à vérifier avec PostgreSQL réel et un test de concurrence.
- La couverture API/intégration, les changements d’heure dans l’interface et la vérification runtime restent à faire.
- Pas de flux complet de suppression/anonymisation d’événement répercuté de façon sûre entre les services.
- Pas de collaboration d’équipe/partage d’accès à un événement.

## Phase 3 — Guests — PARTIAL

- CRUD, groupes, accompagnants, accès par cérémonie et import CSV/XLSX existent.
- La recherche documentée couvre nom/e-mail/téléphone et groupe; le sélecteur Seating utilise maintenant la recherche serveur `q` et un filtre cérémonie validé par Events pour retrouver aussi les invités au-delà des 2 000 premières lignes. Les filtres/recherche par table, RSVP et pointage, ainsi que virtualisation éprouvée à grande échelle, restent à faire.
- Les 14 tests Guests couvrent CSV/XLSX valide, UTF-8/MIME, limites de taille/lignes/colonnes/cellules, formules, archive tronquée, ratio de compression piégé, volume total annoncé décompressé et courriels dupliqués dans le fichier ou déjà présents dans l’événement; typecheck et lint passent. Restent les commits concurrents avec PostgreSQL, imports 1 000/5 000/10 000 lignes avec mesures, rétention et effacement cohérent des références Seating/RSVP/Access/Invitations.

## Phase 4 — Seating — PARTIAL

- Plans TABLE/ZONE, affectations, capacités et import de tables existent.
- Une vue graphique responsive affiche les tables/zones en grille, leur occupation et les invités placés; les invités autorisés non placés peuvent être glissés vers une destination et les invités placés peuvent être déplacés de la même manière. Le formulaire conserve l’affectation au clavier et au tactile; les boutons ont des consignes associées, les résultats de recherche sont annoncés et les transitions respectent la préférence de mouvement réduit. Restent la validation visuelle sur navigateurs/appareils, les tests d’accessibilité automatisés et une disposition libre du plan (positions et orientation personnalisées).
- Les affectations recalculent maintenant l’occupation dans une transaction, verrouillent la ligne de table/zone de destination et sérialisent les déplacements simultanés du même invité par verrou transactionnel PostgreSQL; un dépassement de capacité rejette la transaction avec son outbox. Une modification qui réduirait la capacité sous l’occupation actuelle est aussi rejetée sous le même verrou de ligne. Les tests couvrent le calcul de capacité ainsi que les réponses valides, refusées et malformées du client Guests. La concurrence et ces écritures doivent encore être validées sur PostgreSQL réel. Restent aussi changements d’accompagnants, imports volumineux, mobile et accessibilité.

## Phase 5 — Design Engine — PARTIAL

- Catalogue initial, documents JSON versionnés et éditeur de couches texte/formes/fonds existent.
- « Prévisualiser comme un invité » charge des résultats paginés/recherchés depuis Guest Service au travers du BFF authentifié. Les nouveaux designs reçoivent une variable et un calque destinataire; cette valeur est injectée comme dans le renderer Invitations. Deux tests ciblés passent. La migration augmente la version du template et aligne `metadata.templateVersion`; son application reste `BLOCKED_ENVIRONMENT (runtime Docker)`.
- Le validateur prend en charge des variables textuelles définies dans le document, des calques texte/rectangles/fonds et des profils de format simples. Le modèle ne fournit pas encore le schéma complet prévu (rôles sémantiques par élément, variables métiers `event/guest/ceremony/seating/QR`, conditions d’accès, auto-layout/reflow, contraintes avancées, tokens typographiques/couleurs complets, templates à statuts et versions de publication).
- L’éditeur inclut maintenant une recherche Guests owner-scoped via le BFF et une sélection de vrai invité. Une migration versionne les templates actifs et ajoute un calque `guestName`; l’aperçu remplace cette variable par le nom sélectionné, comme le rendu Invitation. Les anciens snapshots de designs restent inchangés. Les migrations/runtime restent à valider avec PostgreSQL. Les noms longs et blocs multi-cérémonies conditionnels ne sont ni recalculés ni contrôlés par un quality gate complet.
- L’éditeur n’offre pas encore tous les outils prévus (rotation/snapping, alignement, groupes, crop et accès aux assets Media).
- Les templates n’ont pas de registre intégré de licences de polices/assets ni de workflow DRAFT → REVIEW → PUBLISHED avec tests automatiques de contraste, polices, QR et export. Il manque la régression visuelle et l’assurance que l’aperçu et le PDF partagent exactement le même rendu.
- Le service Media accepte et suit les uploads en quarantaine, mais les designs n’ont pas encore de gestion d’assets, recadrage non destructif, remplacement photo ou accès aux seuls objets traités.
- Pas de catalogue vérifié des licences et droits d’incorporation des polices/templates. Les polices actuelles sont système seulement.
- Prévisualisation personnalisée réaliste et contrôle pré-génération des invités sans nom, table surchargée ou cérémonie incomplète restent à compléter.
- Tests visuels, rendu sur appareils et audit WCAG manquent.

## Phase 6 — AI Design — PARTIAL

- File de jobs, proposition structurée, mode Mock et adaptateur de modèle auto-hébergé existent.
- L’IA ne doit produire que des propositions graphiques/assets; l’injection déterministe de toutes les données métier dans le rendu et le modèle de crédits IA configurable restent incomplets. Préviews basse résolution, plusieurs propositions et modifications structurées de tokens ne sont pas encore un parcours utilisateur abouti.
- Des quotas configurables et atomiques limitent maintenant les jobs simultanés par propriétaire et globalement ainsi que les demandes par heure; les reprises respectent aussi le plafond de concurrence. Ils s’appliquent à l’identité propriétaire, pas au workspace, car le modèle d’équipes/workspaces n’existe pas encore. L’utilisation d’un modèle réel/ComfyUI, ses licences commerciales, ses coûts, son débit, ses limites d’abus avancées et sa résilience n’ont pas été validés avec une configuration réelle.
- Sept tests couvrent les décisions de quota, la configuration et l’admission du service; les scénarios concurrents réels nécessitent PostgreSQL et restent à valider en intégration.
- Couverture de tests et mesures de latence/coût manquent.

## Phase 7 — Billing / Wallet — PARTIAL

- Prix versionnés, commandes snapshots, solde, réservations et ledger transactionnel existent.
- L’API des paiements propres à l’utilisateur permet maintenant de parcourir toutes les pages de l’historique; la page wallet ne charge encore que la page initiale de 50 résultats.
- Il manque les factures (numérotation, PDF, archivage et accès client), taxes/frais configurables et export comptable.
- Acceptation versionnée des CGV au moment de l’achat, récapitulatif de commande et politiques de remboursement visibles/configurables manquent.
- Ajustements admin de crédits avec justification, MFA/audit et double contrôle à compléter.
- Promotions/codes promo, abonnement professionnel, commissions et autres revenus sont absents (P1/P2 selon le cahier des charges).
- Tests d’intégration sur doubles crédits, concurrence et reprise après panne manquent.
- Complémentaire v1.0 P0 (02/10/2026): Billing garde des grilles, packs et règles immuables; la nouvelle migration versionne la raison de changement et les champs description, segment, ordre, badge, validité et visibilité. Une grille v2 applique les six valeurs initiales demandées sans altérer v1 ni les commandes. L’API publique filtre les packs visibles/valides; l’API Finance lit aussi les versions cachées pour les réactiver. L’admin édite ces champs et archive/exclut uniquement par une nouvelle version. Taxes, factures, promotions CRUD et acceptation des conditions restent à traiter; les calculs fiscaux et clauses sont `BLOCKED_EXTERNAL (validation juridique)`.
- `prisma generate` 7.10.0, typecheck et build Billing passent. Cinq tests Billing couvrent le filtrage public, l’édition Finance des packs archivés, les devis sans prix client, la règle fixe de crédit et le rejeu idempotent de la grille. PostgreSQL runtime/migration n’a pas été exécuté car Docker reste indisponible. Aucun paquet n’a été installé.
- Audit strict du 02/10/2026: correction d’un rejeu de clé de tarification qui acceptait auparavant des packs/règles différents si auteur/date/motif étaient identiques. L’idempotence compare désormais toute la définition normalisée des packs et règles; les cinq tests Billing passent.

## Exigences complémentaires v1.0 — audit croisé

Le document complémentaire daté du 01/10/2026 a été lu et comparé au cahier principal (122 pages physiques, pagination imprimée jusqu’à 87 puis exigences Design Engine jusqu’au point 310). Il complète le plan principal; il n’autorise ni prix fictifs en production, ni activation FlexPay sans contrat officiel, ni inventer données juridiques.

| Exigence complémentaire | État constaté |
| --- | --- |
| Packs/prix/versionnement Billing | PARTIAL — publication immuable, devis de checkout et snapshots détaillés d’offre/prix/quantité/remise/taxe sont codés; taxe désactivée par défaut et conditionnée à une approbation explicite. Promotions métier, factures et validation réelle des migrations restent manquantes. |
| Crédit par invitation finale | PARTIAL — réservation/règlement idempotents, libération avec tombstone contre réservation tardive et reprise persistante des libérations échouées sont codés et testés unitairement; intégration PostgreSQL/worker reste à valider. |
| Agences/workspaces/collaborateurs | NOT_STARTED — aucun tenant Agency isolé n’existe; ne pas simuler les quotas. |
| Partenaires/attributions/commissions | NOT_STARTED — aucun ledger partenaire ni parcours de règlement/idempotence. |
| Sources/imports de templates designers | PARTIAL — templates éditables et Media upload existent, mais pas d’import image→template, provenance/licence complète ou workflow admin publication. SVG non fiable reste à sanitizer. |
| Compatibilité cérémonies des templates | PARTIAL — versions immuables de template avec types CIVIL/RELIGIOUS/RECEPTION/DOT/TRADITIONAL/UNIVERSAL/CUSTOM, migration des templates actuels en UNIVERSAL, filtrage UI/API par les cérémonies de l’événement et garde de création ajoutés; migration non appliquée au runtime et interface de publication/version admin absente. |
| Texte libre et sélecteur visuel de variables | PARTIAL — éditeur et tokens existent; texte métier, mapping guidé et preview représentative incomplets. |
| Programme par cérémonie | PARTIAL — étapes ordonnées avec titre, description, horaire et durée, CRUD protégé par propriétaire/statut, outbox et interface de consultation/ajout/suppression codés; migration DB/runtime non exécutée et édition/réordonnancement manuel UI manquants. |
| Assistant UX bout en bout | PARTIAL — pages de domaines existent, mais progression explicite, autosave cross-step, aide et reprise ne sont pas cohérents sur le parcours. |
| Import invité guidé | PARTIAL — import CSV/XLSX sécurisé avec limites existe; modèle, mapping, prévisualisation confirmée, erreurs colonne et progression asynchrone manquent. |
| Préflight de génération | PARTIAL — batch async et réservation existent; récapitulatif réel, échantillons multiples, validation capacité/texte/assets et confirmation dédiée manquent. |
| ZIP et guide LISEZ-MOI | PARTIAL — ZIP ajoute maintenant `LISEZ-MOI.pdf` rendu par Chromium et des PDF invités nommés dans `invitations/`; rendu/lecture du ZIP non vérifiés en runtime. Organisation par cérémonie et rapport de liste invités restent à considérer selon le cahier. |
| Administration étendue | PARTIAL — vues prix/support/finance existent; CRUD promotions, plans agence, partenaires, templates et audit financier complet manquent. |
| Sécurité financière/tenant | PARTIAL — rôles, snapshots et idempotence paiement existent; step-up, isolation d’agence et commissions antifraude attendent leurs domaines. |
| Partenaire FlexPay, données légales et production | BLOCKED_EXTERNAL — contrat/credentials FlexPay, identité légale/taxes et accès/validation déploiement restent externes; le reste du travail continue indépendamment. |

### Contrôles critiques de la vérification finale — 02/10/2026

| Contrôle | État | Constat |
| --- | --- | --- |
| Changement de prix d’un pack | PARTIAL | Publication versionnée testée en service; migration réelle non appliquée sur PostgreSQL. |
| Ancienne commande après changement de prix | PARTIAL | Montant/devise/pack/version sont snapshotés; pas de test d’intégration DB démontrant la conservation après publication. |
| Crédit final, réservation et consommation | PARTIAL | Devis financier versionné, réservations/crédits unitaires, règlement idempotent et libération des unités non utilisées codés; intégration DB/renderer non testée. |
| Échec de génération et libération | PARTIAL | Tombstone de libération évite la réservation fantôme tardive; reprises des confirmations de libération sont persistées et testées unitairement; scénario DB/runtime non testé. |
| Isolation agence A / agence B | NOT_STARTED | Aucun domaine Workspace/Agency ni frontière de tenant. |
| Filtrage d’un template par cérémonie | PARTIAL | Compatibilité sur versions immuables, catégories de cérémonie et filtrage par types présents dans l’événement implémentés; migration et validation PostgreSQL manquent. |
| Texte personnalisé et variables | PARTIAL | Variables de calque et valeurs invitées/event au rendu existent; édition texte guidée et débordement restent incomplets. |
| Programme structuré par cérémonie | PARTIAL | Modèle/API/UI d’étapes ordonnées ajoutés; migration/runtime et édition/réordonnancement visuel restent à vérifier/compléter. |
| Import Excel avec erreur ligne/colonne | PARTIAL | Parsing CSV/XLSX sécurisé testé; mapping guidé et rapport détaillé ligne/colonne restent incomplets. |
| Génération ZIP | PARTIAL | ZIP contient des invitations PDF sous `invitations/` et un vrai `LISEZ-MOI.pdf` créé par Chromium; validation du rendu/ZIP requiert runtime. |
| Commission partenaire unique puis refund | NOT_STARTED | Pas d’attribution, ledger ou correction de commission. |
| Autorisations admin | PARTIAL | La route tarifaire utilise `FinanceAdminGuard`; campagne complète et tests d’autorisation inter-domaines absents. |

Les contrôles runtime et les douze scénarios ne sont pas tous validés; les états reflètent le code et les limites d’environnement, pas une validation supposée.

## Phase 8 — Payments — PARTIAL

- Abstraction provider et workflow Mock avec outbox existent. L’intégration FlexPay est un adaptateur de configuration qui refuse volontairement les opérations. Deux tests de l’adaptateur passent (config requise et échec fermé).
- `BLOCKED_EXTERNAL (API FlexPay)` — il manque le contrat marchand officiel FlexPay RDC et les accès sandbox pour finaliser l’authentification, création/vérification, callback/signature, mapping des statuts, devises/moyens et règles d’idempotence. Aucun paiement réel ne doit être activé avant cela.
- La migration récente a retiré l’adaptateur CinetPay. Les enregistrements historiques restent intacts, mais les paiements CinetPay en attente ne sont plus réconciliables depuis cette version.
- Remboursements fournisseur, settlements/reversements bancaires, chargebacks, rapprochement comptable et preuves de litige manquent.
- Le parcours d’administration des paiements Finance par fournisseur n’a pas de tests dédiés, même si la compilation globale passe.

## Phase 9 — Invitation / Rendering — PARTIAL

- Snapshots d’invitation, rendu PDF/ZIP asynchrone, stockage privé, reprise de workers et règlement des crédits existent.
- L’API de liste des lots accepte maintenant `limit`/`cursor` et renvoie un curseur stable. L’interface existante continue d’utiliser la première page limitée à 100 lots.
- Le worker partage encore le code/image Prisma des Invitations; son indépendance de build et d’évolution mérite d’être renforcée.
- Prévisualisation filigranée avant génération, rapport des anomalies par invité, seuils de débit et mesures de throughput/mémoire à éprouver.
- Envoi/distribution par e-mail et partage direct ne sont pas réalisés; les notifications actuelles sont in-app.
- Tests E2E à 100–1 000+ rendus, comparaison visuelle PDF, restauration après crash et rétention des fichiers manquent.
- Audit strict du 02/10/2026: correction du rejeu de clé de batch. Une clé existante n’est retournée que pour le même propriétaire, événement, design et sélection explicite d’invités; une demande différente renvoie un conflit. Quatre tests Invitations passent, dont les deux tests de rejeu.

## Phase 10 — QR / RSVP / Check-in — PARTIAL

- QR signé, RSVP et prévention transactionnelle du double pointage restent canoniques dans Invitations. Access fournit les permissions agents par cérémonie, scan/résumé via un chemin protégé, métadonnées minimales des tentatives et outbox. Les endpoints publics historiques de pointage/résumé dans Invitations ont été retirés pour éviter de contourner Access.
- Mode hors ligne/PWA et synchronisation différée sécurisée ne sont pas implémentés (évolution P1/P2 du cahier des charges).
- La gestion des agents par identifiant Keycloak existe sans annuaire; recherche RSVP/pointage, tests de scans concurrents et charge jour J manquent. Migrations/runtime, protection offline et essais multi-agents restent à valider.

## Phase 11 — Administration / Modération / Hardening — PARTIAL

- File de signalements, transitions de modération, console Support et stockage append-only d’audit existent. `apps/admin` présente maintenant une page d’accueil responsive avec accès à Modération, Finance et Tarification; elle n’introduit aucune donnée de démonstration et les vues métier conservent leurs vérifications d’accès.
- Les autres domaines Admin sont explicitement indiqués comme indisponibles faute d’API/vue dédiée; l’accueil n’est pas une console métier complète ni un remplacement de ces fonctions manquantes.
- Le modèle d’audit ne conserve pas encore tous les éléments demandés pour chaque action admin (avant/après, IP, user-agent, traceId); les types d’actions et vues d’administration sont incomplets.
- Il manque la console complète de gestion utilisateurs/événements/jobs/DLQ, ajustements de crédits, litiges, factures, settlements, analytics et anti-fraude.
- Analytics affiche maintenant les premiers agrégats quotidiens d’événements, invitations, RSVP, pointages, paiements, revenus et crédits; conversion, rétention, CAC/LTV, coût infra, marge, accès runtime et contrôles de complétude/backfill manquent encore.
- Web et Admin ajoutent maintenant une CSP à nonce, HSTS et en-têtes de sécurité; les deux réponses HTTP locales ont confirmé le nonce des scripts. Le hardening complet n’est pas démontré par scans OWASP/SAST/DAST, scans images, rate limits dédiés, alertes, exercices de reprise et audit de permissions.

## Travail transversal de lancement

- Installation antérieure et vérification du lockfile sous Node 24, lint, typecheck, build et tests unitaires ont été exécutés le 30/09/2026; Gateway, Web, Events et Profile ont été retestés après les changements de métriques, d’export, de dates et de demande de suppression. Les validations les plus récentes n’ont installé aucun paquet.
- Créer les tests PostgreSQL/RabbitMQ/Testcontainers, contrats d’événements, Playwright E2E et test obligatoire de persistance après rafraîchissement.
- Exécuter et fiabiliser la pipeline CI ajoutée (lint → types → tests → build, audits/scans → SBOM et images); ajouter tests d’intégration/E2E, Renovate/Dependabot et DAST sur un environnement dédié.
- Ajouter les budgets Lighthouse (JS, LCP, CLS, accessibilité), puis définir les seuils de mise en production.
- Quatre scénarios k6 existent maintenant pour Guests (recherche/pagination), RSVP, check-in et création de batches. Les scénarios mutateurs exigent un acquittement explicite et un environnement staging; batch signale la réservation de crédits et l’enfilement des rendus. Les fichiers passent `node --check`; l’exécution k6 reste `NOT_RUN` car k6 n’est pas installé et le runtime Docker manque. Lighthouse et budgets automatisés restent à faire.
- Instrumenter les services restants OpenTelemetry/logs/metrics, ajouter alertes paiements/base/disque et acheminer les alertes; valider en runtime le dashboard/alerting RabbitMQ, tester les scripts PostgreSQL et les backups Keycloak/object storage par restauration réelle.
- Vérifier responsive mobile, clavier, contraste, lecteurs d’écran et WCAG 2.2 AA sur les parcours essentiels.
- Les routes `/legal`, `/terms`, `/sales-terms`, `/privacy`, `/refund-policy`, `/cookies`, `/contact` ont un registre versionné en brouillon et sont exclues de l’indexation. Elles n’affichent aucune clause inventée; les contacts viennent d’une configuration validée au format e-mail. Restent le contenu légal RDC, les formalités, taxes, remboursements, versionnement/persistance des publications et le journal d’acceptation, tous `BLOCKED_EXTERNAL` tant que les données réelles et la validation professionnelle manquent.
- Déployer et valider la configuration des volumes PostgreSQL/Keycloak/RabbitMQ/MinIO existants et MFA Finance/Super Admin.

## Rapport de vérification — 1 octobre 2026 (observabilité Redis mise à jour le 2 octobre)

| Contrôle                                          | Statut              | Résultat                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installation pnpm / lockfile                      | PASS                | Versions verrouillées et install reproductible hors ligne après téléchargement initial.                                                                                                                                                                                                                                                |
| Lint                                              | PASS                | Zéro erreur; 7 avertissements Web, 4 avertissements FlexPay et messages informatifs Gateway. Les sorties `dist` et Prisma générées sont exclues.                                                                                                                                                                                       |
| Typecheck                                         | PASS                | 18 tâches Turbo réussies. Media et Analytics réutilisent temporairement les outils déjà présents dans Designs/Profile; aucun paquet n’a été installé.                                                                                                                                                                                  |
| Unit tests                                        | PASS, partiel       | La suite monorepo complète passe sous Node 26, dont Gateway; ses six tests couvrent métriques par route et propagation `requestId`/`correlationId`. Analytics compte 10 tests ciblant projections, ordre commit/ack, retry confirmé, DLQ et messages non routés. La couverture reste partielle; la plupart des services n’ont toujours pas de tests. |
| Intégration / contrat / E2E / charge / Lighthouse | NOT_RUN             | Des scripts k6 existent, mais n’ont pas été exécutés. Aucun environnement Docker opérationnel; tests E2E/contrat et Lighthouse absents.                                                                                                                                                                                                  |
| Build                                             | PASS                | Les 18 tâches compilables passent localement sous Node 26, notamment Analytics, Admin et Web. Web et FlexPay conservent respectivement 7 et 4 avertissements connus sans erreur de lint.                                                                                                                                                 |
| Audit des dépendances de production               | PASS                | `pnpm audit --prod --audit-level high`: `No known vulnerabilities found`.                                                                                                                                                                                                                                                              |
| SAST / secrets / filesystem / SBOM / scan images  | NOT_RUN             | Étapes déclarées dans GitHub Actions; aucun runner GitHub n’a exécuté les workflows.                                                                                                                                                                                                                                                   |
| Compose config                                    | PASS                | `docker compose --env-file .env.example config --quiet` valide la configuration avec valeurs d’exemple; aucun `.env` réel n’a été créé ou modifié.                                                                                                                                                                                     |
| Monitoring config                                 | PARTIAL             | Compose et le JSON du dashboard sont vérifiés; exporters PostgreSQL/Redis, ACL PostgreSQL/Redis, scrape et alertes sont déclarés. Les fichiers Prometheus/alertes et l’authentification exporter Redis n’ont pas encore été validés par `promtool` ni en runtime.                                                                        |
| Runtime Docker / migrations / restore             | BLOCKED_ENVIRONMENT | Docker Desktop/daemon n’est pas disponible; les conteneurs, migrations et exercices de restauration restent non vérifiés.                                                                                                                                                                                                              |
| Performance / disponibilité                       | NOT_MEASURED        | Pas de métriques runtime, de données de charge ou de test Lighthouse.                                                                                                                                                                                                                                                                  |
| Analytics AMQP                                    | PASS                | Typecheck, lint, build et 10 tests du service Analytics passent; retry/DLQ est publié sur ConfirmChannel en mode persistant et mandatory, puis acquitté seulement après confirmation. Une publication non routée entraîne un requeue. Runtime RabbitMQ/PostgreSQL reste `BLOCKED_ENVIRONMENT`.                                         |

Validation complémentaire de cette passe (01/10/2026): au contrôle monorepo complet, `pnpm check:workspace` passe (21 workspaces); lint sans erreur; typecheck passe (18 tâches); suite unitaire complète et build passent (18 tâches). Après les ajouts, Web repasse typecheck/lint, 17 tests et build; Admin passe 3 tests, lint, typecheck et build; Guests passe 14 tests (dont les 2 cas zip-bomb), typecheck et lint. Les réponses HTTP Web/Admin ont confirmé les nonces CSP et HSTS; `/terms` répond 200, affiche son état brouillon non indexable et possède un nonce correspondant à sa CSP. Les quatre scénarios k6 passent `node --check`; k6 runtime = `NOT_RUN`. Lint Web conserve 7 avertissements. Aucun paquet n’a été installé. Docker daemon refuse le pipe `dockerDesktopLinuxEngine`; migrations PostgreSQL et tests d’intégration restent non exécutés.

Les seules vulnérabilités déclarées ci-dessus sont celles de dépendances avant correctif. Les analyses SAST/DAST et les permissions d’exécution n’ont pas encore été évaluées; l’audit npm propre ne prouve donc pas à lui seul la sécurité de l’application.

## Dépendances externes bloquantes

1. `BLOCKED_EXTERNAL (API FlexPay)` — contrat marchand officiel et accès sandbox/production.
2. `BLOCKED_EXTERNAL (données légales entreprise)` — identité légale du vendeur, coordonnées et informations fiscales réelles.
3. `BLOCKED_EXTERNAL (validation juridique)` — validation des règles de taxes, remboursements, juridictions et durées de conservation par les responsables compétents.
4. `BLOCKED_ENVIRONMENT (runtime Docker)` — Docker Desktop doit être démarré pour vérifier les services, volumes, migrations et restauration locale.

## Ordre de réalisation proposé

1. Phase 0: installation reproductible, compilation/tests de base, observabilité et sécurité infra.
2. Phases 1–6: supprimer les écarts de suppression/privacy, médias, visuel, performances et tests des parcours existants.
3. Phases 7–8: conformité commerciale/factures puis provider réel une fois FlexPay documenté.
4. Phases 9–10: distribution, préflight, tests de rendu/charge et contrôle d’accès robuste.
5. Phase 11: console admin complète, audit enrichi, métriques business et exploitation.
6. Rejouer l’E2E du parcours maître et ne marquer une phase terminée qu’après ses critères de Done.

## Reprise ciblée du 2 octobre 2026

- Billing/Payments: devis de checkout multi-quantité et snapshots financiers immuables (prix unitaire, quantité, devise, remise/règle, taxe/règle/taux, sous-total, total et version/id de grille) ajoutés. Aucun taux réel n’est inventé: taxes désactivées jusqu’à `BILLING_TAX_POLICY_APPROVED=true` et politique explicitement configurée. Tests unitaires antérieurs de la passe: Billing 8, Payments 6; typechecks Billing, Payments et Web passés. PostgreSQL/migrations non vérifiés.
- Wallet/Invitations: verrouillage par wallet, tombstone de libération avant réservation tardive et reprise idempotente du worker ajoutés. Tests ciblés finaux: Wallet 2/2, Invitations 8/8; typecheck/lint passés. Le sandbox refusait initialement les sous-processus `spawn`; les tests ont ensuite été exécutés avec autorisation d’exécution ciblée.
- Designs: versions immuables de templates avec compatibilité cérémonie; anciennes entrées migrées comme `UNIVERSAL`, filtrage des types par cérémonies de l’événement et vérification avant création. Typecheck/lint Designs et typecheck Web passés; lint Web sans erreur avec 5 avertissements connus. Migration PostgreSQL non appliquée.
- Events: programme ordonné par cérémonie et CRUD complet d’étapes dans Workspace (création, édition, suppression confirmée, réordonnancement persistant, heure, durée, titre, description et lieu). Typecheck/lint Events, typecheck/lint Web passés; tests ciblés Events 10/10.
- ZIP Invitations: fichiers sous `invitations/` avec noms invités nettoyés et `LISEZ-MOI.pdf` produit par Chromium avec vérification de l’en-tête `%PDF-`. Le rendu Chromium et l’ouverture effective du ZIP restent `NOT_RUN` dans ce runtime. Suites ciblées: Billing 8/8; Payments 6/6; Wallet 2/2; Invitations 8/8; Events 4/4 (dates/fuseaux). Aucun de ces tests ne remplace la migration PostgreSQL ou un rendu réel Chromium.
- Agences (socle partiel): modèles Prisma/migration (workspace, membership OWNER/ADMIN/MEMBER, client, abonnement snapshoté, rattachement client-événement et réservation de quota), routes tenant-scoped, checkout `AGENCY_SUBSCRIPTION` et activation idempotente depuis l’événement paiement. Le pipeline Invitations réserve maintenant le quota disponible atomiquement avant les crédits Wallet supplémentaires; une réservation partielle est persistée et le règlement consomme d’abord le quota puis la part Wallet. Tests ciblés Events 15/15 et Invitations 9/9; typecheck/lint Events et Invitations passent. La période d’abonnement/renouvellement, l’administration complète des membres/clients/abonnements, les migrations exécutées et les tests runtime PostgreSQL/RabbitMQ restent à faire.
- Agences plans: migration catalogue Billing ajoute les valeurs de seed demandées et Enterprise reste configurable via l’éditeur existant de grilles immuables. Tests Billing ciblés 9/9, typecheck/lint Billing passés. La migration n’a pas été exécutée sur PostgreSQL.
- Partenaires/commissions: NOT_STARTED pour ce bloc. Aucun modèle Partner/ReferralAttribution/CommissionLedgerEntry/PartnerPayout, attribution de commande, traitement idempotent `payment.succeeded`/refund, dashboard ni écrans Admin de payout. Il faut implémenter le parcours d’attribution/checkout en même temps que le ledger pour éviter toute commission sans commande attribuée valide.
- Aucun paquet installé. Runtime PostgreSQL, migrations et E2E non exécutés. La suite Messages ci-dessus indique les capacités complètes et les éléments encore à intégrer sans prétendre que le socle agence constitue le produit fini.

## Contrat checkout typé — 3 octobre 2026

- `PaymentOrderType` persisté: `CREDIT_PURCHASE` et `AGENCY_SUBSCRIPTION`; les commandes historiques sont migrées vers `CREDIT_PURCHASE` car le modèle antérieur ne gérait que les packs de crédits. Référence métier et métadonnées du snapshot sont immuables.
- Billing distingue explicitement le type de devis et refuse les packs hors segment. Payments vérifie le type et le schedule demandé depuis la souscription puis publie `payment.succeeded.v2` / `payment.refunded.v2` avec ordre, client, montant, devise, transaction fournisseur et metadata. Les événements v1 restent pour compatibilité seulement sur achats/refunds de crédits.
- Wallet vérifie `orderType` pour v2 et ignore les souscriptions agence; l’idempotence rend sans double crédit la compatibilité v1+v2. RabbitMQ inclut une file d’événements de paiement agence.
- Checkout/activation agence: création de souscription `PENDING`, commande Billing/Payments avec référence stable, vérification du snapshot et activation idempotente par événement. Cela reste `PARTIAL`: `billingPeriodEnd`/expiration/renouvellement ne sont pas renseignés; runtime PostgreSQL/RabbitMQ/provider non validé.
- Quota agence/génération: réservation atomique sous verrou de souscription; support du fallback vers crédits Wallet quand le quota est partiellement disponible; le règlement consomme le quota d’abord. Tests ciblés couvrent concurrence/quota partiel (Events) et règlement mixte/reprise de libération (Invitations). Le runtime DB et un test bout-en-bout multi-service restent à exécuter.
- Tests ciblés actuels: Billing 10/10, Payments 6/6, Wallet 6/6, Events 15/15, Invitations 9/9. L’administration complète des membres/plans reste partielle; Partenaires est NOT_STARTED et n’a pas été commencé faute de clôture de toutes les conditions de l’agence.

## Cycle agence et socle Partenaires — 4 octobre 2026

- Abonnement agence: la durée `periodDays` est un champ configurable de la grille Billing et est copiée dans le devis/commande/souscription. Le paiement confirmé ouvre une période distincte; un renouvellement payé avant échéance commence à l’échéance courante, snapshotte nouveau plan/version/quota et garde la période antérieure intacte. Les réservations restent limitées à une période et l’expiration est marquée `PAST_DUE` à la première lecture/réservation quota. Checkout manuel seulement; pas de prorata ni renouvellement automatique. Les anciennes souscriptions sans date connue deviennent `PAST_DUE` via migration, sans durée inventée. Tests ciblés activation/idempotence/période future.
- Plans agence: le CRUD continue de réutiliser les grilles Billing immuables versionnées: publication (création/modification), visibilité active/inactive, archivage, prix/devise/quota/nom/description/ordre/badge/dates et motif/acteur. L’écran Admin Tarification permet maintenant de configurer la durée de la période pour chaque plan agence. Une offre agence historique sans durée doit recevoir une durée validée par publication Admin avant tout nouveau checkout.
- Membres agence: rôle OWNER/ADMIN/MEMBER conservé; l’UI et l’API permettent ajout, rôle ADMIN/MEMBER, suspension, réactivation et retrait logique. ADMIN gère les seuls MEMBER; seul OWNER peut nommer un ADMIN. Les changements sont workspace-scoped, audit avant/après ajouté et dernier OWNER actif protégé sous verrou workspace. Invitation automatique Keycloak/acceptation d’invitation non faite; ajout par subject de compte existant seulement.
- Partenaires/commissions: modèles `Partner`, `ReferralAttribution`, `CommissionLedgerEntry`, `PartnerPayout` et liens payout-ledger ajoutés. Attribution par code/lien, propriétaire auto-parrainé refusé, attribution existante jamais remplacée. `payment.succeeded.v2` crée dans la transaction une commission unique seulement pour partenaire actif, attribution active et type configuré; taux et base sont snapshotés. Refund garde la commission originale et ajoute une reversal négative idempotente. Ledger financier protégé en base par trigger d’immuabilité/transitions.
- Partenaire Admin et dashboard: routes FinanceAdmin pour partenaires, statuts, taux, types éligibles, attributions, ledger, audit et payout; `/admin/partners` ajoute la console. `/partners` affiche les données réelles et états vides; `/referral?code=...` enregistre l’attribution authentifiée. Les payouts sont liés aux écritures payable; approbation et état `PROCESSING` fonctionnent, mais toute transition `PAID` est bloquée jusqu’à l’intégration d’un fournisseur et d’une confirmation vérifiable (`BLOCKED_EXTERNAL`).
- Migrations créées: Billing `20261004100000_agency_billing_periods`; Events `20261004110000_agency_subscription_period_history`, `20261004120000_agency_audit_and_member_states`; Payments `20261004130000_partner_commission_ledger`. Aucune migration n’a été exécutée: l’unique tentative de démarrage PostgreSQL/RabbitMQ s’est arrêtée sur `permission denied` au pipe Docker Desktop (`BLOCKED_ENVIRONMENT`).
- Tests ciblés au 4 octobre: Billing 10/10; Payments 12/12 (incluant le blocage PAID sans vérificateur); Events 17/17; Invitations 9/9. Typechecks concernés Billing/Payments/Events/Gateway/Web/Admin passés; lint concerné sans erreur (4 avertissements FlexPay connus, message de configuration eslint Gateway). Pas d’E2E/runtime PostgreSQL/RabbitMQ.
- Reste PARTIAL: pas de tests d’intégration PostgreSQL prouvant triggers/transactions et migrations; périodes des offres historiques à configurer via Admin; pas de notification/acceptation Keycloak des membres; filtres/pagination sur les consoles partenaires limités aux dernières 200 écritures/attributions/audits; le déploiement réel du payout est externe. La confirmation manuelle `PAID` exige toutefois une référence externe non vide.

## Durée fixe des abonnements agence — 5 octobre 2026

- Règle corrigée: toute commande et période `AGENCY_SUBSCRIPTION` exige exactement 30 × 24 heures. Billing normalise les packs AGENCY sans durée vers 30 jours, refuse les valeurs différentes, et le devis/Payments valident 30. La page Admin affiche la règle fixe, sans champ de durée agence.
- La migration Billing `20261005100000_agency_period_fixed_30_days` normalise les lignes de catalogue AGENCY à 30; elle ne modifie aucun snapshot ou intervalle de souscription/paiement historique.
- À confirmation du paiement, chaque période démarre à l’instant de confirmation, reçoit 30 jours et utilise sa propre souscription/quota. Les réservations sélectionnent uniquement une période dont `billingPeriodEnd` est futur; le quota restant précédent n’est pas reporté. L’événement dupliqué ne réactive pas ni ne recrée la période.
- L’espace agence montre prix par 30 jours, explication checkout, dates d’activation/expiration, jour courant, jours restants, barre de progression et quota utilisé/réservé/restant à partir de l’abonnement et des réservations backend. Les dates historiques non conformes ne reçoivent pas de progression estimée.
- Dashboard partenaire: définitions PENDING/PAYABLE/PAID/REVERSED et empty states expliqués; PAID reste réservé à une confirmation vérifiable externe. La sélection d’invitations affiche un message quota lisible avec le déficit lorsque l’API renvoie le solde.
- Validations ciblées du 5 octobre: Billing 10/10; Payments 13/13; Events 18/18; Web 23/23 (dont calcul de période); typechecks Billing/Payments/Events/Web et lint Billing/Events/Web sans erreur. Les erreurs `spawn EPERM` sans accès processus ont été contournées avec exécution autorisée des tests. PostgreSQL/runtime et migrations non exécutés.
- UX restante PARTIAL: explications et animations légères/réduction de mouvement ne sont pas encore uniformisées dans tous les parcours (programme cérémonie, invitations hors erreur de quota, partenaires Admin). Responsive reste à vérifier visuellement sur appareils réels; aucun budget Lighthouse/LCP/INP/CLS n’a été mesuré.

## Stockage — reprise ciblée du 4 octobre 2026

### Terminé dans le code (validation locale uniquement)
- Invitations persiste désormais `size_bytes` des PDF et `zip_size_bytes` des ZIP écrits avec succès. Les migrations gardent `NULL` pour les fichiers historiques dont la taille n’est pas connue; aucune taille n’est estimée. L’API admin Invitations expose les totaux connus, tailles inconnues, meilleurs événements et rattachements existants agence/propriétaire. Le Gateway fusionne cette source à la page `/admin/storage`.
- Les erreurs de suppression ZIP sont retryables par la boucle existante et enregistrent compte d’essais + code d’erreur; la page admin expose les retries en attente.
- J’ai suspendu la suppression d’assets Media prêts, car Designs et Invitations ne fournissent pas encore un inventaire exhaustif de leurs références. Le retry Media ignore les objets prêts en statut `DELETING` au lieu de risquer d’effacer un fichier utilisé; la page Admin compte ces assets bloqués. Les clés de quarantaine sans objet publié restent nettoyables.
- Migration Invitations `20261004150000_invitation_storage_sizes` est additive uniquement: deux tailles nullable, deux champs de suivi retry avec défaut zéro, et index de consultation. Aucun `DROP`, `TRUNCATE` ou réécriture des données historiques.
- Typecheck et build Invitations, typecheck Gateway et Web, génération/validation Prisma Invitations passent. Le typecheck Media doit être relancé après le verrouillage conservateur du nettoyage.

### Partiel / non validé
- La mesure `statfs` existante concerne l’espace libre/capacité du filesystem monté en lecture seule sur `minio_data`; ce n’est pas une mesure du total d’objets MinIO et elle dépend d’un montage local. La page doit donc être comprise comme capacité du volume monté. Le total exact des objets MinIO, sa capacité distante, le breakdown Media par événement/agence, previews expirées, PNG dérivés orphelins et artefacts temporaires ne sont pas consolidés. L’API Prometheus officielle MinIO expose des métriques de cluster/buckets, mais l’intégration sécurisée au MinIO épinglé dans Compose n’est pas encore faite.
- L’architecture de références Designs/Invitations (réconciliation de versions et snapshots historiques) reste à implémenter. En conséquence, toute suppression d’asset prêt est suspendue; aucun bouton de purge manuelle n’est proposé. Les suppressions d’objets dérivés individuels ne sont pas encore assez sûres pour être activées.
- Aucun E2E upload → preview → PDF → ZIP → expiration → nettoyage n’existe/ n’a été exécuté. Les tests rembg (PNG alpha, échec, timeout, CPU/RAM, pression stockage et nettoyage temporaire) restent à créer et exécuter. Pas de validation PostgreSQL/MinIO/Chromium en runtime.
- Les seuils 70/80/90/95 et le blocage d’opérations lourdes existent; la couverture runtime de leurs interactions sous charge stockage reste non testée.
- Next `spawn EPERM` a été reproduit par `node child_process.spawnSync()` pour lancer simplement `node -e process.exit(0)`, avant le code Next. Cela pointe vers la restriction de création de processus du runtime Windows, pas une preuve d’un défaut frontend. Web `tsc` passe; le build Next de production n’est pas validé ici.
- Environnement de ce passage: Docker CLI 29.8 présent, mais aucun serveur `desktop-linux` joignable (pipe `npipe:////./pipe/dockerDesktopLinuxEngine` absent). Les tests Invitations et Media ont été exécutés avec succès après autorisation d’exécution élargie; cela ne valide pas les dépendances runtime Docker.

### Validation migrations sur le poste Windows avec Docker Desktop fonctionnel
Depuis PowerShell à la racine `D:\invitflow\invitaflow`, avec `.env` déjà renseigné et Docker Desktop Linux démarré:

```powershell
docker compose up -d postgres
docker compose run --rm media-db-init
docker compose run --rm --no-deps media pnpm prisma:migrate:deploy
docker compose run --rm --no-deps invitations pnpm prisma:migrate:deploy
```

Ces commandes ne réinitialisent pas les volumes et n’appliquent que les migrations en attente. Puis démarrer `docker compose up -d minio minio-bootstrap media invitations gateway` (les dépendances Compose requises démarrent également) et vérifier `docker compose ps`, `docker compose logs --tail=100 media invitations gateway`, `/health/ready` des services et `/v1/admin/storage` avec un token admin valide. Ne pas lancer `down -v` ni `prisma migrate reset`.
- Validation complémentaire effectuée après le verrouillage: build Invitations passe; typechecks Invitations, Gateway, Media, Web et `prisma validate` Invitations passent. Suites ciblées: Invitations 14/14, Media 5/5 (dont garde anti-suppression sans références); lint ciblé Invitations passe. Warning Node DEP0205 observé au lancement des tests, sans échec.

## Stockage — inventaire MinIO et vérification de références (4 octobre 2026)

### DONE (code et validations locales)
- Media implémente une signature AWS SigV4 en lecture seule et `ListObjectsV2` paginé sur les buckets configurés. Le compte MinIO `storage-audit` ne possède que `s3:ListBucket`. Les sommes proviennent des tailles retournées par MinIO; aucun `HEAD` par objet ni métrique fabriquée.
- L’inventaire complet est persisté dans `storage_inventory_snapshots` avec `measuredAt`, `validUntil`, statut, sommes/buckets, compteurs et erreur. La lecture Admin utilise le dernier snapshot, et `POST /v1/admin/storage/refresh` est réservé aux rôles Support/Super Admin, limité à un lancement/minute. Une limite d’objets produit un snapshot INCOMPLETE sans total exact.
- La page `/admin/storage` distingue objets MinIO réels et capacité filesystem `statfs`, affiche répartition par bucket/catégorie, tailles historiques inconnues, réconciliation disponible, dates/fraîcheur et refresh. Aucun inventaire n’est lancé sur chargement de la page.
- Media ne se connecte pas aux bases Designs/Invitations. Deux APIs internes protégées par `STORAGE_MONITOR_TOKEN` répondent `REFERENCED`/`UNREFERENCED`; suppression Media exige la réponse positive des deux. Échec/inconnu garde le statut DELETING et réessaie; réponse référencée bloque et est auditée. Les opérations DELETE S3 sont idempotentes.
- Migrations ajoutées sans destruction: `services/media/prisma/migrations/20261004170000_storage_inventory_snapshots` crée uniquement snapshot + index; `services/invitations/prisma/migrations/20261004150000_invitation_storage_sizes` ajoute tailles nullables/compteurs retry + index. Données historiques de taille restent NULL.
- Tests locaux: Media 9/9 (parser XML, refus de tailles malformées, suppression bloquée/inconnue/référence absente); Invitations 14/14; Designs document 4/4. Prisma validate Media et Invitations, lint Media/Invitations/Designs, builds Media/Invitations/Designs, typechecks Media/Invitations/Designs/Gateway/Web réussis. Media lint a un avertissement inutilisé corrigé après le lint; à rerun.

### PARTIAL
- La réconciliation couvre les clés Media reconnues, PDF/ZIP Invitations et ZIP expirés si l’API Invitations a retourné toutes ses pages. La lecture pagine jusqu’à 200 pages; au-delà le résultat est explicitement incomplet. Les previews expirées sont comptées à partir de `updatedAt`, pas depuis leur date d’accès. Elles ne sont pas supprimées automatiquement. Les assets Media orphelins sont échantillonnés, pas purgés.
- Les buckets `generated` sans convention/metadata propriétaire restent classés non classés; les fichiers du volume filesystem et anciens artefacts locaux ne sont pas tous attribués à une catégorie S3. Les erreurs retryables Media et Invitations apparaissent en compteurs séparés dans l’UI; l’historique des erreurs persistantes n’a pas encore de console détaillée par objet/job.
- Les vérifications de référence utilisent les données persistées locales à Designs et Invitations et couvrent les documents/versions et snapshots historiques connus. Elles réduisent le risque IDOR/BOLA entre bases et fail-closed sur erreur. Il reste une fenêtre de course entre lecture `UNREFERENCED` et écriture concurrente d’une nouvelle référence; un protocole de lease/réservation transactionnelle inter-service est nécessaire pour une garantie absolue avant d’activer une purge générale. La purge Media demandée par un propriétaire effectue les checks, mais ce protocole de concurrence n’est pas encore disponible.
- Top événements/agences: chiffres invitations seulement, fournis par les rattachements existants; Media n’a pas de relation évènement/agence persistée permettant cette ventilation. L’UI indique explicitement cette limite.

### NOT TESTED
- Aucun E2E complet upload → preview → rembg → design → invitation → PDF → ZIP → stats → expiration → nettoyage exécuté; la suite d’intégration automatisée correspondante reste à écrire. Les tests actuels n’utilisent aucun MinIO/DB simulé comme données de production; le test unitaire référence uniquement les frontières.
- rembg réel non vérifié: PNG alpha, timeout, entrée invalide, erreur processus, limites CPU/RAM, suppression des fichiers temporaires et pression disque.
- Lint Media après retrait de la variable inutilisée, parcours visuel mobile/admin, collecte réelle d’objets MinIO, politiques/compte read-only dans MinIO, et migrations en DB non testés.
- La base `media` (images), `invitations` (pdf/zip) et `designs` gardent leurs bases par service. Snapshot d’inventaire est stocké dans DB Media.

### BLOCKED
- Runtime Docker/PostgreSQL/MinIO/rembg bloqué dans cet environnement: `docker info` et `docker compose ps` échouent avec `permission denied` sur `npipe:////./pipe/dockerDesktopLinuxEngine`. Cela ne prouve pas une panne du code Docker; le daemon Desktop est inaccessible au compte/processus courant.
- Build Next de production non refait dans cette passe. Le `spawn EPERM` antérieur est reproductible avant Next dans `child_process.spawnSync`, indiquant une restriction du runtime d’exécution, pas une preuve d’erreur de code.

#### Validation locale Windows à faire quand Docker Desktop est accessible
Depuis `D:\invitflow\invitaflow`, `.env` renseigné avec secrets distincts forts pour `STORAGE_MONITOR_TOKEN`, identifiants MinIO audit et DB:

```powershell
docker compose up -d postgres minio
# Attendre postgres/minio healthy puis appliquer les migrations additives du service concerné:
docker compose run --rm --no-deps media pnpm prisma:migrate:deploy
docker compose run --rm --no-deps invitations pnpm prisma:migrate:deploy
# Bootstrap crée les buckets et le compte read-only audit
docker compose up -d minio-bootstrap designs invitations media gateway
# Vérifier état/logs, puis demander un inventaire depuis la page Admin Storage
docker compose ps
docker compose logs --tail=100 minio-bootstrap media designs invitations gateway
```

Ne pas exécuter `down -v` ni `prisma migrate reset`. Après migrations, faire les parcours E2E et scénarios rembg sur un environnement de test isolé, inspecter `storage_inventory_snapshots`, confirmer un refresh via Admin avec un utilisateur autorisé, et vérifier qu’une suppression référencée est refusée puis retentée lorsque les services sont indisponibles.
- Réconciliation Media encore partielle : la comparaison Media couvre les objets assets/<uuid> prêts et les variantes connues; le bucket media-quarantine est mesuré en taille mais ses clés d’upload/quarantaine ne sont pas rapprochées de toutes les lignes transitoires/artefacts. Les références de snapshot sont bornées aux formats PDF/ZIP actuellement produits. Les totaux MinIO restent valides au niveau bucket si tous les listings sont complets, mais ces sous-comptages ne sont pas un inventaire de tous les orphelins.

## Intégration Figma Make InvitaFlow — tranche 1 (4 octobre 2026)

- Analyse des deux dépôts et mapping exhaustif des 32 écrans Figma vers les routes/services actuels consigné dans `docs/FIGMA_MAKE_INTEGRATION.md`. Le prototype Vite, son contexte, son router et ses données codées en dur ne sont pas importés.
- **DONE**: landing `/` redessinée dans une direction éditoriale plum/or, responsive, CTA vers le vrai flux `/api/auth/login`, liens légaux réels, aucun chiffre/témoignage ni événement d’exemple. Nouvelle navigation commune: sidebar desktop et navigation fixe mobile limitée à cinq destinations, avec chemins réels/contextuels d’événement, logo officiel et styles reduced-motion. Aucun paquet ajouté.
- **PARTIAL**: les autres pages front-office InvitaFlow sont inchangées et restent à harmoniser par groupes tout en gardant APIs et états. L’auth visuelle reste portée par le thème Keycloak existant. Pas de dark mode global cohérent dans le front existant; non introduit partiellement dans cette tranche.
- **DONE validation tranche**: Web typecheck passe; lint des fichiers modifiés passe; suite Web 27/27 passe. Le lint global du workspace n’est pas vert: il signale une erreur préexistante dans `apps/web/src/app/events/[eventId]/seating/workspace.tsx:190` (`<a>` au lieu de `Link`) et 6 avertissements préexistants. Les tests Web ont nécessité l’autorisation d’exécution des workers Node après `spawn EPERM` dans sandbox.
- **NOT TESTED**: rendu visuel multi-navigateurs/appareils et thème Keycloak connecté non inspectés dans un navigateur, pas de build Next de production exécuté.
- **PARTIAL suite**: Dashboard agrégé, onboarding, profil invité autonome et stats par événement n’ont pas de route dédiée/contrat complet aujourd’hui; ils ne seront pas remplis de fausses données. Voir mapping/ordre dans `docs/FIGMA_MAKE_INTEGRATION.md`.

## Intégration Figma Make — parcours principal (4 octobre 2026)

### DONE
- `/dashboard` ajouté comme accueil authentifié, alimenté uniquement par le prénom OIDC et les événements réellement retournés par Gateway. Les cartes et prochaines actions n’inventent aucun compteur ni événement.
- `/events` conserve ses APIs et opérations. Création progressive (type, nom, date/fuseau; description facultative), formulaire repliable et ouverture des cérémonies du nouvel événement après création. La vue événement peut ouvrir l’éditeur existant de cérémonies via `/events?event=<id>`.
- Vue événement et lien du parcours harmonisés. L’éditeur existant de cérémonies/programme reste l’unique implémentation.
- Invités harmonisés; ajout manuel inchangé côté API; import CSV/XLSX propose dépôt ou sélection du fichier, puis conserve analyse, mapping, preview, erreurs et confirmation.
- Styles plum/or/crème, responsive mobile-first, focus visible, reduced-motion et sélecteurs de préparation dark mode ajoutés.
- Lien interne de la vue seating converti de `<a>` en `next/link`, même destination et comportement.
- Aucun backend, Prisma, Docker, API, permission, rôle, OIDC, dépendance ou donnée de production simulée modifié.

### PARTIAL
- Le modèle Event n’a pas de champ `location` ni d’estimation d’invités. Le formulaire ne prétend pas enregistrer ces valeurs; lieu/capacité se règlent par cérémonie, et le total visible vient de la liste réelle des invités.
- RSVP, table et check-in ne sont présentés que lorsque les informations existent dans les données retournées au workspace; aucune valeur synthétique créée.
- Dark mode préparé via variables/sélecteurs mais aucun contrôleur global uniforme n’existe dans l’App Router.

### NOT TESTED
- QA visuelle authentifiée à 375 px, 768 px et desktop. Le serveur Next a démarré, mais `/dashboard` a abouti à `/?auth=unavailable`; l’environnement n’a pas fourni d’authentification OIDC/Gateway locale. Aucun contournement d’auth n’a été utilisé.
- Parcours de mutations API événement → cérémonie, invité et import en runtime; dépendances Docker/DB non établies ici.
- Build Next production.

### VALIDATION LOCALE
- Typecheck Web : réussi après correction d’une incompatibilité de propriété optionnelle stricte.
- ESLint ciblé sur les pages/workspaces/navbar concernés : réussi sans avertissement ni erreur.
- Tests Web : 27/27 réussis hors sandbox avec permission pour les workers Node. L’exécution sandboxée échouait avant l’exécution des tests (`spawn EPERM`).
- `git diff --check` : réussi après les dernières modifications (avertissements Git uniquement sur les conversions LF/CRLF des fichiers déjà modifiés).
- Compilation Next dev : `/dashboard` et `/events` compilent. `events.css` émet un avertissement Autoprefixer préexistant sur `align-items:end`; aucune erreur de compilation.

## Intégration Figma Make — Designs, Templates et placement (4 octobre 2026)

### DONE
- Seating affiche les places restantes et les états complet/dépassement/capacité inconnue à partir des données réelles. Création/édition/suppression, recherche, affectation et déplacement reposent sur les APIs existantes.
- Catalogue Designs harmonisé : recherche, filtres supportés, aperçu des métadonnées réelles, états d’erreur/retry/vide, sélection du template existant et ouverture du design créé.
- Éditeur : panneaux progressifs mobile Aperçu/Calques/Réglages; aperçu sans crédits avec vrai invité/cérémonie/table lorsque disponibles; IA garde le workflow et les états jobs existants. Aucun rendu final déclenché.
- CSS local réutilise les tokens partagés, focus visible, responsive et reduced-motion; Autoprefixer `end` remplacé par `flex-end`.
- Aucun endpoint, modèle, dépendance, backend, rôle ou donnée fictive ajouté.

### PARTIAL
- Niveau et prix Gratuit/Premium absents du contrat Designs/Billing : aucun badge/prix n’est présenté avant exposition de données fiables.
- Preview catalogue est une illustration de style dérivée des métadonnées style/couleur, pas le document invitation entièrement rendu. Aucun layout libre de salle n’est persisté par le modèle.
- Dark selectors préparés sans commutateur global.

### NOT TESTED
- Interaction et QA visuelle navigateur authentifiée à 375/768/desktop; mutations API, IA, Media privé et persistance DB runtime.
- Build Next production et tests UI dédiés.

### BLOCKED
- Preview authentifiée des routes Designs/Seating reste bloquée par l’absence de session OIDC/Gateway locale. En dev, les routes ont répondu avec leur redirect OIDC (307); Seating a émis une compilation réussie. La vue visuelle authentifiée reste non vérifiée.

### VALIDATION LOCALE
- Typecheck Web: réussi.
- ESLint ciblé: 0 erreur, 4 avertissements dans Designs workspace (effets React existants et image IA `<img>`).
- Tests Web: 27/27 réussis hors sandbox; l’exécution sandboxée ne peut créer les workers Node (`spawn EPERM`).
- PostCSS parse des styles ciblés: réussi. `git diff --check`: réussi avec seuls avertissements de conversion Git LF/CRLF.

## Intégration Figma Make — Inviter, RSVP et Check-in (4 octobre 2026)

### DONE
- Génération: récapitulatif avec données réelles, solde wallet si disponible, estimation maximale 1 crédit/invitation, quota agence laissé au service, confirmation avant réservation et verrou anti-double-submit. Preview gratuite et règlement sur rendu réel explicités.
- Sélection invités: tous vs sélection explicite, recherche, total du serveur et limites d’IDs alignées avec Invitations; erreurs/états réels de lots et fichiers.
- PDF téléchargeables uniquement pour items terminés avec objectKey; ZIP seulement terminé/non expiré/non supprimé; taille/expiration si le service les renvoie; régénération uniquement pour ZIP expiré/supprimé via endpoint existant.
- Page publique harmonisée: données invité/événement/cérémonies autorisées et RSVP du contrat actuel, réponse existante et édition possible; erreurs invalid/expiré/non disponible, reprise et anti-double-submit. Aucun accès à autre invité, aucune création QR.
- Check-in mobile: scan caméra réel BarcodeDetector ou saisie, états succès/déjà pointé/refus/invalide/service temporaire, reprise sans bypass; statistiques restent cachées en attente/échec au lieu d’afficher de faux zéros.
- Réutilisation des tokens et du shell Phases 1/2, CSS mobile/focus/dark-prep/reduced-motion. Aucun changement backend, API, sécurité, crédits, QR ou dépendance.
- Les anciens avertissements ESLint Designs ont été corrigés sans changer le cycle des effets ni l’accès de l’image API protégée.

### PARTIAL
- Le contrat de prévalidation n’expose pas la liste d’invités incomplets/invalides; Invitations les valide pendant le lancement et fournit les échecs du lot.
- Pas de lecture pré-lancement combinée wallet personnel + quota workspace; le solde personnel est affiché et le quota éventuel est vérifié autoritairement par le backend lors de la réservation.
- API publique sans table/QR; non affichés. L’API scan ne donne pas la table.

### NOT TESTED
- Aucun OIDC connecté, RSVP soumis, QR/caméra réel, réservation ou settlement Wallet réel, PDF/ZIP téléchargé/régénéré ni taille MinIO vérifiés en runtime.
- Next build production non exécuté; aucun nouveau test E2E interservice, aucun code backend touché.
- Navigateur: état d’indisponibilité publique avec token fictif seulement; pas de débordement horizontal à 375/768/1440. Ce n’est pas un test d’une invitation valide. Vues privées redirigées OIDC.

### BLOCKED
- Parcours complet requiert les services Docker/runtime et session OIDC locale; l’endpoint public répond 503 sans backend. Aucune donnée ou session de test n’a été inventée.

### VALIDATION
- Typecheck Web réussi; ESLint ciblé: 0 erreur/avertissement sur les fichiers concernés.
- Tests Web 27/27 hors sandbox; dans sandbox, les workers échouent avec `spawn EPERM` avant tout test.
- Routes Next dev Invitations, Check-in et Invite compilées; pages privées 307 OIDC; page Invite répond 200 et endpoint de lecture token 503 faute de backend.
- CSS parse PostCSS et `git diff --check` réussis (avertissements Git LF/CRLF seulement).

## Intégration Figma Make — Wallet / crédits / paiement — 4 octobre 2026

- **DONE (UI/API existantes)**: wallet en crédits distincts des sommes payées; packs/prix dynamiques Billing; récapitulatif avant checkout; verrou double-submit; états/historique Wallet et Payments alimentés par endpoints réels; relecture serveur des paiements actifs; aucune réussite déduite d’un retour URL. Aucun changement métier/backend.
- **PARTIAL**: historique limité aux 50 entrées/commandes sans pagination; écran uniquement consacré aux packs de crédits, sans options événement/agence; le contrat utilisateur ne fournit aucun reçu/facture.
- **NOT TESTED**: vrai paiement, webhook, provider, attribution du crédit après succès, OIDC/services locaux et QA authentifiée responsive. Les routes Wallet et proxy Payments compilent en Next dev, mais la page privée redirige OIDC et l’API répond 401 sans session.
- **BLOCKED**: validation runtime checkout dépend de Keycloak/Gateway/Billing/Payments/Wallet et d’un provider configuré. Next nécessite une autorisation processus locale dans cet environnement, obtenue pour la compilation des routes.
- **Validation de code**: typecheck Web et ESLint ciblé Wallet passent; 27 tests Web passent en lancement individuel séquentiel. Le runner standard `node --test` échoue avant exécution en sandbox avec `spawn EPERM`. `git diff --check` passe.

## Intégration Figma Make — Espace Agence — 4 octobre 2026

- **DONE (UI et API existantes)**: tableau de bord sans métriques inventées; recherche et détail client dans la page; création client/événement; Événements existants réutilisés par lien; équipe avec rôles/statuts/actions disponibles; plans dynamiques Billing, souscription via endpoint existant et crédits affichés seulement pour abonnement actif; sidebar et navigation mobile limitée à cinq actions.
- **DONE (correction BFF)**: proxy `/api/agencies` autorise maintenant `PATCH /:workspaceId/members/:memberId`, déjà exposé par Events mais auparavant rejeté par le proxy. Pas de changement au backend métier.
- **PARTIAL**: service agence ne fournit pas le profil client en modification, paramètres, invitation par e-mail, historique de facturation, reporting ni statistiques récentes; les subjects Keycloak n’ont pas de nom e-mail affichable. L’endpoint de liste événements omet actuellement la relation client-événement; seules les associations connues lors de la création courante sont montrées. Aucun endpoint/backend modifié pour inventer ces fonctions.
- **NOT TESTED**: isolation A/B et permissions multi-workspace sur runtime authentifié; création/modification de compte client/membre/événement; paiement et activation d’abonnement; QA visuelle aux viewports 375/768/desktop.
- **BLOCKED**: validation de bout en bout requiert OIDC, Gateway, Events, Billing, Payments et base accessibles avec données de contrôle. `/agencies` renvoie 307 et le proxy membres PATCH 401 sans session locale.
- **Validation**: Web typecheck OK; ESLint ciblé OK sans avertissement; tests Web 29/29 séquentiels, dont les nouveaux tests agence; Next dev compile page Agence/proxy et renvoie 307/401 sans session; `git diff --check` OK (avertissements line-ending LF/CRLF Git seulement).

## Intégration Figma Make — Espace Partenaire — 4 octobre 2026

- **DONE**: `/partners` harmonisé sans changer backend, API, Gateway, rôles ou auth. Données réelles du dashboard: code/statut, clients attribués, ventes confirmées, commissions groupées et ledger, demandes/historique payout. Lien d’attribution copiable, demande de règlement seulement quand une devise payable est signalée. Demande distincte d’un paiement confirmé; seuls les statuts backend attestent le règlement. Responsive, shell commun, barre mobile <= 5 actions, états vides/erreur, focus et reduced-motion.
- **DONE (sécurité revue dans le code)**: le service cible le partenaire par `ownerSubject` authentifié et filtre les relations par `partnerId`; le BFF utilise session OIDC, Origin pour mutations, bearer Gateway et allowlist stricte GET `/me` / POST `/attributions` / POST `/me/payouts`. Pas de données invités ni d’API admin dans le parcours.
- **PARTIAL**: le modèle est celui d’un partenaire commercial. Aucune API métier ne fournit missions, commandes assignées, événements concernés, détails opérationnels, édition de profil ou support; ces écrans Figma sont omis. Aucun moyen de paiement ni règlement automatique n’est implémenté. Le ledger n’est pas paginé côté API.
- **NOT TESTED**: interaction navigateur authentifiée et QA responsive; appel payout réel; isolation entre deux partenaires en runtime.
- **BLOCKED**: validation runtime dépend de Keycloak, Gateway, Payments, PostgreSQL et comptes partenaires contrôlés. Aucun état ou jeu de données n’a été simulé pour les contourner.
- **Validation**: typecheck Web et ESLint ciblé Partenaire/AppNavbar réussis; tests Web existants 29/29 réussis en exécution individuelle séquentielle. Le runner groupé échoue dans le sandbox avant exécution (`spawn EPERM`). Next dev compile `/partners` et `/api/partners/[[...path]]`; sans session la page redirige 307 OIDC et le BFF renvoie 401. `git diff --check` réussi (avertissements Git de normalisation LF/CRLF uniquement).

## Finalisation globale Figma Make — 4 octobre 2026

- **DONE**: ThemeProvider/ThemeToggle partagé (clair/sombre, préférence locale, synchronisation onglets, `prefers-color-scheme`), contrôles accessibles dans shell et pages publiques, overrides ciblés dark mode, mesure responsive navigateur Landing/Legal/RSVP aux six viewports, aucune donnée ou API simulée. Mapping final des 32 parcours et limites ajouté à `docs/FIGMA_MAKE_INTEGRATION.md`.
- **PARTIAL**: la consolidation de toutes les variantes de composants CSS n’est pas achevée; la QA visuelle, clavier/contraste exhaustive et le thème sombre authentifié des pages privées restent à faire. Les écrans Figma sans contrat backend sont volontairement omis ou remplacés par les routes existantes.
- **NOT TESTED**: parcours runtime authentifié et mutations OIDC/services (paiement, invitations, check-in, agency/partner); l’invitation de test n’a pas été soumise.
- **BLOCKED**: QA privée demande Keycloak/Gateway et jeux contrôlés; aucune session de test artificielle n’a été créée.
- **Validation**: Web typecheck OK; ESLint ciblé/global OK sans avertissements; 29/29 tests existants en exécution séquentielle; Next production build réussi hors sandbox (`spawn EPERM` dans sandbox); Next dev compile Landing, Legal, Invitation, Dashboard, Events, Designs, Invitations, Wallet, Agence et Partenaire; routes privées redirigent OIDC (307); responsive sans débordement sur les pages publiques mesurées; `git diff --check` réussi (warnings LF/CRLF).
- **Conclusion historique — supersédée par la section Final cleanup ci-dessous.** La QA runtime est distincte du statut UI.

## Final cleanup Figma Make — 4 octobre 2026

- **DONE — UI**: la matrice autoritaire des 32 parcours et la distinction UI/runtime sont dans `docs/FIGMA_MAKE_INTEGRATION.md`. La conclusion précédente `NO` est supersédée: **Figma Make integration complete at UI level: YES**. Aucune tâche de design frontend restante n’a été identifiée pour les capacités backend existantes.
- **DONE — consolidation vérifiée**: shell/navigation, logo, ThemeProvider et ThemeToggle sont partagés. Pas d’autre doublon équivalent justifiant une abstraction sans risque métier; aucun import/dépendance runtime Figma. Aucune dépendance ni fonctionnalité supprimée.
- **DONE — correction**: compléments du dark mode Événements/Invités dans `apps/web/src/app/events/journey.css` (formulaires, programme, cérémonies, badges, surfaces et contrastes textuels).
- **NOT TESTED — runtime UI privée**: QA authentifiée visuelle/interaction aux six largeurs, clavier et screen reader exhaustifs, OIDC, mutations, paiements, RSVP/check-in, IA, agences/partenaires. L’absence de session n’a pas été contournée.
- **NOT TESTED — viewport privé exhaustif**: responsive navigateur réellement mesuré à 320/375/430/768/1024/1440 uniquement pour Landing, Legal et l’état sans service de l’invitation. Toutes les routes se compilent, ce qui ne certifie pas leurs rendus authentifiés.
- **Validation cleanup**: typecheck Web OK; ESLint global Web OK; suite Web 29/29 via fichiers exécutés séquentiellement (runner sandboxé standard rencontre `spawn EPERM`); build Next production OK; `git diff --check` OK (avertissements de normalisation LF/CRLF seulement).
- **Runtime authenticated QA complete: NO**. Les écrans Figma sans support API sont marqués `OMITTED — unsupported by backend`, sans chiffres ou comportement fictifs.

## Fondations du moteur DesignDocument v2 — 4 octobre 2026

- **DONE**: package partagé `@invitaflow/design-document`; schéma v2 fermé, whitelist de bindings, normalisation v1 en mémoire, registre de polices système, variantes zéro/une/deux/trois/multi cérémonies, groupes répétables, visibilité, safe area, ajustement texte déterministe, scale canvas/viewport et ordre z stable. Designs sert les anciens documents sous forme v2 en mémoire et accepte/valide v2 sans migration ni réécriture des lignes existantes.
- **DONE**: Invitations utilise le résolveur partagé avant toute réservation de crédits, archive le layout résolu par invité dans le snapshot immuable et le worker l’utilise pour son PDF; anciens snapshots sans layout suivent encore le chemin compatible. Web réutilise le même résolveur dans la preview de l’atelier. Fixtures couvrent v1 et v2.
- **PARTIAL**: aucun nouveau template Botanique/Éditorial, asset graphique, masque aquarelle, résumé IA, ni refonte majeure de l’éditeur; les masques identifiés sont explicitement refusés au rendu tant que le moteur visuel n’existe pas. Les polices restent des fontes système (pas de fontes embarquées). Aucun nouveau E2E interservice complet.
- **NOT TESTED**: rendu PDF réel avec un design v2 chargé en base et navigateur authentifié; persistance PostgreSQL et vérification runtime de récupération de snapshots v1; affichage navigateur responsive de cette version de preview.
- **BLOCKED**: validation runtime PDF/DB authentifiée nécessite les services locaux et une invitation de test contrôlée; aucune donnée n’a été fabriquée pour la contourner.
- **Validation ciblée**: tests package design-document 11/11; tests Invitations `.mjs` 8/8, dont invitation-layout 3/3; adaptateurs Designs v1→v2 et validation v2 exercés directement. Le runner Node passe en `--test-isolation=none`; typecheck Designs/Web/Invitations passe. ESLint ciblé Web passe; ESLint Designs/Invitations ne démarre pas, le plugin local `@typescript-eslint/eslint-plugin` est absent. `git diff --check` passe. Aucun Prisma schema ou migration modifié pour cette fondation.
- **Outillage**: `pnpm` et la validation du lockfile gelé sont bloqués par `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK` (refus d’accès au verrou global dans `%LOCALAPPDATA%`). Les entrées workspace correspondantes ont été ajoutées manuellement à `pnpm-lock.yaml`; aucune dépendance externe n’a été installée.

## Phase 2 — parité Preview / PDF et moteur visuel v2 — 4 octobre 2026

### DONE
- Le package partagé produit le layout résolu déterministe : texte/variables, cérémonie et champs associés, visibilité, variantes, ordre z, fit de texte/lignes, fonte du registre, asset référencé, diagnostics et géométrie logique. Aucun accès réseau/DB dans le resolver.
- Le calcul cover/contain/crop est maintenant partagé par Web et Invitations. La transformation logique vers un viewport utilise un facteur uniforme centré et garde les proportions.
- L’aperçu React consomme les lignes, la taille, le line-height, le poids/style de police et les valeurs résolues du resolver; les champs réels disponibles sur l’événement et ses cérémonies sont passés au snapshot. Le PDF v2 sérialise le même render tree avec les mêmes bornes, lignes et paramètres typographiques; l’URL QR est remplacée par l’URL propre à l’invitation au rendu.
- Les snapshots/documents historiques v1 gardent le renderer précédent; aucun schéma Prisma ni migration n’a été modifié. Résolution/validation est toujours avant la réservation des crédits; Wallet/Billing ne sont pas touchés.
- Tests ajoutés pour le renderer SVG partagé, résolution asset sans fetch, crop, rotation, opacité, z-order, transformation uniforme, accents/majuscules/ponctuation/espacement typographique et texte long. Pas de noms ni données tirés des JPG de référence.

### PARTIAL
- Web rend avec React SVG et le PDF avec le sérialiseur SVG partagé. Les valeurs, géométries, wrapping et réglages typographiques sont communs, mais une comparaison pixel-par-pixel Web/Chromium n’existe pas encore; l’antialiasing et la disponibilité des fontes système restent susceptibles de varier.
- Le registre garde les fontes système existantes (Georgia, Arial, Times New Roman); aucune police n’est embarquée. Les valeurs de champs cérémonie absentes sont correctement omises, mais il n’y a pas encore de capture visuelle couvrant un vrai événement pour chacune des variantes 0–4.
- Aucun changement de `pnpm-lock.yaml` ou installation n’a été nécessaire pour ces changements de code; l’acceptation du lockfile par pnpm n’a pas pu être validée.

### NOT TESTED
- Chromium réel, PDF A5 généré et inspection de pages n’ont pas été exécutés ici. Runtime Docker/DB, parcours v1 historique chargé depuis la base et test E2E invité/QR/PDF non vérifiés.
- Les tests du service Designs TypeScript n’ont pas pu s’exécuter : le runner `tsx --test` échoue sur `spawn EPERM` avant les assertions; l’exécution Node directe ne résout pas `design-document.js` sans transpilation. Le typecheck Designs passe; aucune spec ne porte encore sur le serializer PDF dans ce package.

### BLOCKED
- La validation pnpm/lockfile (`pnpm install --lockfile-only --offline`) s’arrête avant installation sur `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`: Windows refuse l’ouverture de `%LOCALAPPDATA%\\pnpm-store-operation-locks\\all-stores.lock` (Accès refusé). Le store global n’a pas été supprimé ni modifié.
- Runtime PDF/Chromium bloqué par l’absence de lancement Docker/runtime dans cette session.

### Validation ciblée
- `packages/design-document`: 13/13 tests OK.
- `services/invitations/src/*.spec.mjs`: 8/8 tests OK.
- Typechecks Web, Designs et Invitations: OK (`tsc --noEmit --incremental false`).
- ESLint ciblé Web: OK sans sortie/diagnostic.
- `git diff --check`: OK (seuls avertissements Git de conversion LF/CRLF sur fichiers concernés).
- ESLint Invitations ciblé: OK. ESLint Designs ciblé: deux erreurs `no-explicit-any` préexistantes dans `src/design-document.ts` (lignes 241 et 244), fichier non modifié dans cette phase. Build/runtime Chromium non validés dans cette passe.

## Phase 3 — moteur visuel artistique v2 — 5 octobre 2026

- **DONE** : rôles IMAGE BACKGROUND/FOREGROUND/PHOTO/TEXTURE/DECORATION; catalogue fermé/versionné none, rounded-soft, organic-portrait-01, watercolor-soft-01, brush-edge-01; focal point borné et crop commun; overlays unis/dégradés RGB/RGBA; blur borné; opacité/rotation/zIndex; PNG/WebP transparents. Web utilise maintenant exactement le sérialiseur SVG du PDF, avec annotations d'éditeur séparées. Contrôles fonctionnels ajoutés dans l'inspecteur image, qualité A5 et diagnostics visibles.
- **DONE** : validation DPI après crop/zoom avec target impression/Web; lecture des dimensions réelles des PNG/WebP Media avant réservation, refus des métadonnées v2 incohérentes; images derrière les textes/QR autorisées, images au-dessus susceptibles de masquer le contenu signalées. Safe area critique conservée; décorations/photos de fond autorisées dans les marges. V1 reste sur son renderer historique. Aucune migration, modification Wallet/Billing/Payments, suppression ni réécriture rembg.
- **DONE — runtime local** : Chrome 154.0.8037.93 a rendu les dix fixtures A–J et les cinq masks en captures Web et PDF A5 de 1 page. PNG alpha et WebP lossless alpha testés réellement. Comparaison Poppler 96 DPI, inspection de la planche et assertions de silhouette/z-order : erreur moyenne maximale 0,818/255, proportion maximale de pixels avec différence de canal >24 de 0,574 %. La comparaison porte sur le sérialiseur partagé avec des rasters synthétiques, pas sur un événement réel ou les photos du client.
- **PARTIAL** : catalogue de masques initial, rendu aquarelle procédural contrôlé plutôt qu'assets artistiques de production; appréciation esthétique/contraste photographique manuelle. Pas de bibliothèque décorative ni de familles finales publiées. Les checks de collision sont conservateurs (cadres, sans analyse des pixels alpha). Le contrat Media et ses références existantes sont réutilisés; leur runtime de conservation n'a pas été réexécuté.
- **NOT TESTED** : Chromium Linux du worker Docker, parcours authentifié Web/Media/MinIO/batch, contrôle utilisateur responsive des nouveaux réglages, paiement/crédits en runtime et références en PostgreSQL. La comparaison locale ne remplace pas ces validations.
- **BLOCKED** : Docker refuse l'accès au named pipe dockerDesktopLinuxEngine (permission denied). Les erreurs spawn EPERM de Chrome/tsx ont été dépassées par lancement autorisé hors sandbox; elles ne bloquent plus la QA locale. Aucun package ni lockfile modifié.
- **Validation** : shared 31/31, Designs 5/5, Invitations 9/9, Web ciblé 6/6; typechecks package déclarations/Web/Designs/Invitations et ESLint ciblé réussis. git diff --check réussi, avertissements LF/CRLF uniquement. Scripts reproductibles `scripts/validate-design-visual.mjs` et `scripts/compare-design-visual.py`; détails et commandes dans `docs/DESIGN_VISUAL_V2.md`. Artefacts QA dans `%TEMP%\invitaflow-visual-phase3`, hors production.

## Phase 4 — premiers templates professionnels — 5 octobre 2026

- **DONE** : Botanical Elegance, Photo Editorial Luxury et African Contemporary v2, 5 variants par famille (0/1/2/3/4+ cérémonies), canvas A5 logique 1480 × 2100, safe area 80, bleed 0, palettes, Georgia/Arial, bindings réels, zones explicites, slots photos et masks contrôlés. Table et libellé conditionnels; QR uniquement lorsque disponible, zone dédiée hors programme. Photo principale obligatoire avant impression pour les recettes photographiques uniquement; aucune donnée métier fictive, aucune tarification.
- **DONE** : personnalisation guidée Web (photo, réutilisation BG/secondaire, zoom/focal, couleurs contrastées, fonts autorisées), catalogue avec document réel, locks serveur comparés au document persisté et résistants au réordonnancement JSONB. Upload Media existant réutilisé. Correction démontrée GET → POST puis blob privé pour les previews; correction des gutters des grilles répétées et de la projection metadata v2 vers validation v1.
- **DONE** : branche botanique originale générée, PNG RGBA/alpha vérifiés, photo DEMO fictive isolée des templates publiés; sources dans docs/template-assets, provenance/prompts documentés. Lecture authentifiée des seuls décors explicitement publiés via autorité Designs; refus fermé en cas de panne, suppression et mutation toujours owner-scoped. Script de publication DB Designs uniquement, version immuable, verrou par slug et outbox; assets Media READY vérifiés, aucune migration ou modification Docker/Prisma/Keycloak/Gateway/Billing/Wallet/Payments.
- **DONE — validation locale** : design-document 38/38 (960 combinaisons + tests de protections/overflow/identités), Designs 6/6, Invitations 10/10 avec 12 cas QR, Web 8/8, Media 8/8 avec read-only/refus/panne. Typechecks Web/Designs/Media/Invitations et déclarations partagées OK; ESLint ciblé OK. Script de publication exécuté uniquement en validation-only, sans écriture DB.
- **DONE — artefacts de contrôle** : 12 previews/SVG/PDF A5 d'une page produits avec Chrome Windows 154.0.8037.93, puis rasterisés avec Poppler et examinés. Exemples, planche et mesures dans docs/template-previews. Report détaillé, comparaisons de principes avec les références et commandes dans docs/PROFESSIONAL_TEMPLATES.md.
- **PARTIAL** : la comparaison pixel stricte échoue pour les 12 rendus photographiques (MAE maximale 4,0751/255; pixels avec écart de canal >24 : maximum 5,361 %). Les seuils restent inchangés; --report-only conserve les flags d'échec. Contours texte/photo différents et trait fin sur certains PDFs masqués observés; cause précise et correction encore à qualifier. Ne pas déclarer une parité pixel parfaite ou la Phase 4 terminée en production. Cadrage des photos réelles et qualité graphique finale à revoir; textes/adresses excessifs conservent leurs diagnostics.
- **NOT TESTED** : upload/publication/republication dans PostgreSQL et MinIO, accès intercompte réel aux décors, parcours Next/OIDC authentifié, responsive 375/768/desktop, fonts et Chromium Linux worker, exports runtime des invitations réelles. Aucun template déclaré effectivement publié.
- **BLOCKED** : Docker répond toujours permission denied sur dockerDesktopLinuxEngine. Publication locale prévue par scripts et commandes documentées; aucun secret réel dans les documents. Phase IA non démarrée.

## Phase 4 — reprise du 5 octobre : recettes sans photo

- DONE : six recettes extensibles / trois familles; trois SINGLE_PHOTO explicitement obligatoires et trois NO_PHOTO recomposées. Cinq variantes cérémonie par recette; bindings table/QR conditionnels; zone QR hors programme.
- DONE : catalogue filtré depuis l’inventaire réel privé PHOTO/READY; pagination, orientation et états indisponibles; contrôles photo absents sur NO_PHOTO; contrat metadata prêt pour un futur composer, sans IA nouvelle.
- DONE : publication validation-only des six documents sans écriture; protections de structure et anciennes versions conservées. Détails, palettes/fonts/masks et règles facultatives : PROFESSIONAL_TEMPLATES.md.
- DONE : tests partagés 40/40, Designs 6/6, Web ciblé 5/5, Invitations layout 5/5; typechecks et lint ciblés; diff-check.
- PARTIAL : photographic pixel parity conservée (MAE max 4,0751/255; pixels divergents max 5,361 %), structure cohérente sur les 12 PDF photographiques déjà examinés. Aucune nouvelle recherche de pixel-perfect.
- NOT TESTED : nouveaux layouts sans photo en navigateur/PDF, parcours authentifié, publication PostgreSQL/Media, fonts Linux, E2E complet différé par demande explicite.
- BLOCKED : Docker Desktop permission denied lors de la session précédente; publication runtime à faire localement avec les commandes de PROFESSIONAL_TEMPLATES.md.

PHASE 4 COMPLETE: YES — implémentation et validations minimales de reprise; limites runtime ci-dessus conservées, aucune déclaration de validation production.

## Grammaire de composition — extension des fondations Phase 4

- DONE : registre multi-recettes par famille sans limite de catalogue; dimensions contrôlées et backgroundTreatment explicite.
- DONE : validateProfessionalComposition refuse les choix incompatibles et coordonnées inconnues; empreinte canonique pour comparaisons de diversité; manifeste reproductible sérialisable avec seed/release/version, validé v2 sans mutation.
- DONE : tests partagés 42/42; typecheck déclarations partagées, Web et Designs; tests Designs 6/6; publication validation-only; git diff --check.
- PARTIAL / limites conservées : parité pixel photographique; aucune nouvelle campagne visuelle.
- NOT TESTED : publication réelle et E2E runtime, comme indiqué dans la reprise précédente. BLOCKED : accès Docker précédemment refusé.
- Phase 6 réalisée depuis cette reprise : grammaire extensible, filtrage, scoring, seed reproductible, diversité et manifeste documentés dans AI_DESIGN_COMPOSER.md; aucune recomposition par invité.

## Phase 5 — assistance éditoriale (5 octobre 2026)

- DONE : workflow EDITORIAL_COMPRESSION séparé dans AI Design, JSON/jobs/outbox/worker existants, quotas et trois propositions par Design/version; aucun microservice ni migration.
- DONE : éligibilité explicite pour event.invitationText, fitting/variante déterministes avant proposition, cible LIGHT/BALANCED/CONCISE; aucun champ structuré envoyé.
- DONE : masquage en une passe et vérification des fragments; provider self-hosted abstrait, timeout, erreurs/langue contrôlées, aucun résultat simulé ni appel par invité.
- DONE : vérification finale exige aussi chaque placeholder protégé exactement une fois le nombre attendu et dans l’ordre source; le contrat provider n’inclut ni version source ni identifiant interne.
- DONE : original/proposition dans le modal de l’éditeur, correction manuelle, acceptation explicite, stale/expiration/refus, nouveau Design/version et restauration de l’historique; AI_ASSISTED uniquement en metadata/audit.
- DONE : tests ciblés DesignDocument 48/48, AI Design 11/11, Designs 9/9, Web 7/7, Invitations layout 6/6; typechecks et ESLint ciblés; git diff --check.
- NOT TESTED : provider réel/qualité linguistique et fidélité du modèle déployé; PostgreSQL/RabbitMQ, modal authentifié/mobile et E2E global. Aucun gros runtime lancé conformément au périmètre demandé.
- PARTIAL : détection automatique des noms/faits non exhaustive et filtre linguistique conservateur; relecture humaine et fragments explicitement marqués requis. Les documents historiques sans déclaration éditoriale ne sont pas modifiés. Les limitations visuelles Phase 4 restent inchangées.
- BLOCKED : aucun blocage pour l’implémentation/test ciblé; runtime différé, sans nouvelle tentative Docker.

Données provider, endpoints existants étendus, fichiers et commandes de validation : AI_EDITORIAL_ASSIST.md. Lien workspace interne ajouté à AI Design avec importer pnpm cohérent; aucun paquet externe installé. Aucun changement Gateway/Keycloak/Docker/Prisma/Billing/Wallet, ni composer Phase 6.

PHASE 5 COMPLETE: YES — périmètre implémentation et validations ciblées.

## Phase 6 — AI Design Composer (5 octobre 2026)

- DONE : Composer déterministe sans appel provider obligatoire; filtres événement/cérémonie/densité/média avant scoring; profils extensibles, six recettes initiales et aucune limite globale de catalogue.
- DONE : stratégies NO_PHOTO, SINGLE_PHOTO, BACKGROUND_PHOTO, FOREGROUND_PHOTO et MULTI_PHOTO; photos Media READY authentifiées, sélection orientée sur dimensions/crop, palettes et tokens enregistrés; aucun contenu Guest chargé.
- DONE : scoring inspectable, sélection seedée, minimum de diversité familiale, exclusion des propositions montrées en session et empreintes des Designs choisis dans le même événement/propriétaire.
- DONE : parcours Web événement réel, préférences guidées, 3–6 cartes/préviews v2, liste mobile, régénération et choix explicite; backend reproduit la proposition, refuse les documents modifiés et crée uniquement au choix une version immuable 1 avec seed/recette/média/empreinte.
- DONE : tests ciblés DesignDocument et Designs; typechecks, Web tests/lint, ESLint ciblé et `git diff --check` exécutés pendant la reprise.
- NOT TESTED : navigateur authentifié, PostgreSQL/RabbitMQ, Docker/E2E global et runtime Media réel. Aucun provider n’est appelé par cette version; aucune génération d’image, migration Prisma, Wallet ou Billing.
- PARTIAL : six recettes initiales et spécialisations mariage/dot photo; les recettes NO_PHOTO restent génériques pour les autres types. QA éditoriale/graphique par type et inventaires au-delà de 2 000 photos nécessitent du travail ultérieur.
- BLOCKED : aucun blocage de code ciblé.

Détails d’architecture et limites : AI_DESIGN_COMPOSER.md.

PHASE 6 COMPLETE: YES — implémentation et validations ciblées; QA runtime différée.

## Phase 7 — parcours client AI Design (5 octobre 2026)

- DONE : étapes progressives événement/photos/style/propositions dans le workspace Design existant; registre partagé utilisé pour filtrer les types d’événement.
- DONE : avec/sans photo ou choix laissé au Composer; miniatures et orientation des médias privés READY, sélection transmise comme identifiants owner-scoped, pas comme fichiers.
- DONE : préférences client, génération à quatre propositions par défaut, lots conservés pendant régénération, empty state sans candidat, previews v2 et retour au workspace existant après sélection.
- DONE : garde de Design existant avec action Continuer et confirmation avant création d’un nouveau Design; aucun remplacement implicite. Préférences temporaires, Design/version 1 persistés au choix selon la Phase 6.
- PARTIAL : Analytics produit dédiés absents. Texte libre reste le parser déterministe local. L’accessibilité modale/clavier et la navigation mobile nécessitent vérification navigateur manuelle.
- NOT TESTED : Docker, runtime authentifié, E2E global.

Détails : `docs/AI_CUSTOMER_JOURNEY.md`. Phase 8 EasyPay non commencée.
