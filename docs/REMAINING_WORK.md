# InvitaFlow — reste à faire des 12 phases

État établi le 30 septembre 2026 en comparant le code présent au prompt maître et au cahier des charges v1.0. Les mentions de phase « implémentée » dans le README désignent parfois un premier parcours de domaine; elles ne signifient pas que les critères de mise en production, de tests et d’exploitation sont satisfaits.

Statuts : `DONE` signifie critères vérifiés; `PARTIAL` signifie qu’une partie existe, mais qu’il reste des écarts; `NOT_STARTED` signifie qu’aucun parcours réel n’est présent; `BLOCKED_ENVIRONMENT` et `BLOCKED_EXTERNAL` identifient uniquement la validation ou la décision impossible localement. Aucun statut `DONE` n’est revendiqué pour une phase entière à cette date.

## Phase 0 — Foundation — PARTIAL

- **Squelettes incomplets :** `services/media`, `services/access` et `services/analytics` n’ont pas de comportement métier. `apps/admin` redirige vers le web au lieu d’être un back-office autonome.
- **Observabilité partielle :** le Collector, Prometheus, Grafana, Loki et Tempo sont dans Compose, mais les services n’instrumentent pas OpenTelemetry; il manque traces propagées dans HTTP/RabbitMQ, métriques applicatives et métier, alertes et tableaux Grafana exploitables.
- Le Collector expose maintenant ses métriques internes et convertit les métriques OTLP en endpoint Prometheus; Prometheus scrape les deux endpoints. Les applications ne sont toujours pas instrumentées, donc leurs métriques/traces ne seront disponibles qu’après ajout des SDK et instrumentation.
- `.dockerignore` exclut maintenant les fichiers d’environnement, dépendances locales et artefacts du contexte Docker; cela évite d’envoyer les `.env` aux builds qui copient le contexte entier.
- Keycloak local est maintenant raccordé à `keycloak_db` avec un rôle isolé. Un job Compose idempotent provisionne aussi les volumes Postgres existants; reste à démarrer l’environnement et valider inscription/login/MFA.
- **Sécurité/exploitation :** pas de profiles Compose pour démarrer des sous-ensembles; protections des conteneurs, limites de ressources, filesystem read-only et `no-new-privileges` à compléter; pas de stratégie de backup et de restauration testée.
- **Qualité du socle :** pas de pipeline CI/CD; très peu ou pas de tests par service; pas de tests contractuels; environnement complet et healthchecks jamais validés ensemble.
- **Packages partagés :** `contracts`, `ui` et `observability` ne couvrent qu’une petite partie des contrats, composants et intégrations prévus.

## Phase 1 — Identity / Profile — PARTIAL

- Le parcours d’inscription/connexion OIDC, session BFF et profil de base existe, mais n’a pas été compilé ni testé en E2E sur un Keycloak opérationnel.
- MFA renforcée par rôle admin et vérification du parcours MFA restent à configurer et valider.
- Un export JSON local des champs actuellement affichés dans le profil est disponible; il ne contient pas événements, invités, documents, crédits, paiements ou autres données détenues par les services. L’export complet du compte, suppression de compte, rétention/anonymisation et gestion des consentements juridiques/marketing restent à implémenter. Le contenu légal et les durées applicables sont `BLOCKED_EXTERNAL` en attendant les informations réelles et la validation professionnelle.
- Pas de gestion d’équipes, invitations de collaborateurs ou rôles par événement.

## Phase 2 — Events — PARTIAL

- Création d’événements et cérémonies multi-cérémonies existe avec fuseaux horaires; couverture de tests, validation temporelle aux changements d’heure et vérification runtime manquent.
- Pas de flux complet de suppression/anonymisation d’événement répercuté de façon sûre entre les services.
- Pas de collaboration d’équipe/partage d’accès à un événement.

## Phase 3 — Guests — PARTIAL

- CRUD, groupes, accompagnants, accès par cérémonie et import CSV/XLSX existent.
- La recherche documentée couvre nom/e-mail/téléphone et groupe; filtres/recherche par table, cérémonie, RSVP et pointage, ainsi que virtualisation éprouvée à grande échelle, restent à faire.
- Tests de sécurité fichiers, volumétrie, formules de tableur, rétention et effacement complet des données invitées manquent.

## Phase 4 — Seating — PARTIAL

- Plans TABLE/ZONE, affectations, capacités et import de tables existent.
- Le planificateur visuel/graphique des tables est absent; la disposition reste une liste et des formulaires.
- Les flux restent à vérifier pour conflits concurrents, changements d’accompagnants, imports volumineux, mobile et accessibilité.

## Phase 5 — Design Engine — PARTIAL

- Catalogue initial, documents JSON versionnés et éditeur de couches texte/formes/fonds existent.
- Upload média, gestion d’assets, recadrage et remplacement photo manquent; le service Media est un squelette.
- Pas de catalogue vérifié des licences et droits d’incorporation des polices/templates. Les polices actuelles sont système seulement.
- Prévisualisation personnalisée réaliste et contrôle pré-génération des invités sans nom, table surchargée ou cérémonie incomplète restent à compléter.
- Tests visuels, rendu sur appareils et audit WCAG manquent.

## Phase 6 — AI Design — PARTIAL

- File de jobs, proposition structurée, mode Mock et adaptateur de modèle auto-hébergé existent.
- L’utilisation d’un modèle réel/ComfyUI, ses licences commerciales, ses coûts, quotas, limites d’abus et sa résilience n’ont pas été validés avec une configuration réelle.
- Couverture de tests et mesures de latence/coût manquent.

## Phase 7 — Billing / Wallet — PARTIAL

- Prix versionnés, commandes snapshots, solde, réservations et ledger transactionnel existent.
- Il manque les factures (numérotation, PDF, archivage et accès client), taxes/frais configurables et export comptable.
- Acceptation versionnée des CGV au moment de l’achat, récapitulatif de commande et politiques de remboursement visibles/configurables manquent.
- Ajustements admin de crédits avec justification, MFA/audit et double contrôle à compléter.
- Promotions/codes promo, abonnement professionnel, commissions et autres revenus sont absents (P1/P2 selon le cahier des charges).
- Tests d’intégration sur doubles crédits, concurrence et reprise après panne manquent.

## Phase 8 — Payments — PARTIAL

- Abstraction provider et workflow Mock avec outbox existent. L’intégration FlexPay est un adaptateur de configuration qui refuse volontairement les opérations.
- `BLOCKED_EXTERNAL:FLEXPAY_API` — il manque le contrat marchand officiel FlexPay RDC et les accès sandbox pour finaliser l’authentification, création/vérification, callback/signature, mapping des statuts, devises/moyens et règles d’idempotence. Aucun paiement réel ne doit être activé avant cela.
- La migration récente a retiré l’adaptateur CinetPay. Les enregistrements historiques restent intacts, mais les paiements CinetPay en attente ne sont plus réconciliables depuis cette version.
- Remboursements fournisseur, settlements/reversements bancaires, chargebacks, rapprochement comptable et preuves de litige manquent.
- Les tests du nouvel adaptateur ont été ajoutés mais pas exécutés; le paiement Finance par fournisseur vient d’être ajouté et reste non compilé/non testé.

## Phase 9 — Invitation / Rendering — PARTIAL

- Snapshots d’invitation, rendu PDF/ZIP asynchrone, stockage privé, reprise de workers et règlement des crédits existent.
- Le worker partage encore le code/image Prisma des Invitations; son indépendance de build et d’évolution mérite d’être renforcée.
- Prévisualisation filigranée avant génération, rapport des anomalies par invité, seuils de débit et mesures de throughput/mémoire à éprouver.
- Envoi/distribution par e-mail et partage direct ne sont pas réalisés; les notifications actuelles sont in-app.
- Tests E2E à 100–1 000+ rendus, comparaison visuelle PDF, restauration après crash et rétention des fichiers manquent.

## Phase 10 — QR / RSVP / Check-in — PARTIAL

- QR signé, RSVP, pointage et prévention du double pointage sont implémentés dans Invitations; `services/access` reste un squelette séparé.
- Mode hors ligne/PWA et synchronisation différée sécurisée ne sont pas implémentés (évolution P1/P2 du cahier des charges).
- Gestion d’équipes/agents de contrôle, recherche par statut RSVP/pointage, tests de scans concurrents et charge le jour d’un événement manquent.

## Phase 11 — Administration / Modération / Hardening — PARTIAL

- File de signalements, transitions de modération, console Support et stockage append-only d’audit existent.
- Le modèle d’audit ne conserve pas encore tous les éléments demandés pour chaque action admin (avant/après, IP, user-agent, traceId); les types d’actions et vues d’administration sont incomplets.
- Il manque la console complète de gestion utilisateurs/événements/jobs/DLQ, ajustements de crédits, litiges, factures, settlements, analytics et anti-fraude.
- Le dashboard business (revenu, conversions, crédits, rétention, CAC/LTV, coût infra et marge) n’existe pas; Analytics est un squelette.
- Hardening non démontré par scans OWASP/SAST/DAST, scans images, rate limits dédiés, alertes, exercices de reprise et audit de permissions.

## Travail transversal de lancement

- **À exécuter après autorisation d’installer les dépendances :** installation propre sous Node 24, lint, typecheck, build, tests unitaires et service par service.
- Créer les tests PostgreSQL/RabbitMQ/Testcontainers, contrats d’événements, Playwright E2E et test obligatoire de persistance après rafraîchissement.
- Ajouter pipeline CI (lint → types → tests → scans → SBOM → build → E2E), scans Trivy/Semgrep/Gitleaks, Renovate/Dependabot et DAST sur environnement dédié.
- Ajouter k6 et budgets Lighthouse (JS, LCP, CLS, accessibilité), puis définir les seuils de mise en production.
- Brancher OpenTelemetry/logs/metrics, dashboards et alertes; tester backups PostgreSQL/Keycloak/object storage par restauration réelle.
- Vérifier responsive mobile, clavier, contraste, lecteurs d’écran et WCAG 2.2 AA sur les parcours essentiels.
- Mettre en place pages légales versionnées (`/legal`, `/terms`, `/sales-terms`, `/privacy`, `/refund-policy`, `/cookies`, `/contact`), journal d’acceptation et checklist de readiness. Le contenu légal RDC, les formalités, taxes et politique de remboursement nécessitent validation par le propriétaire et un professionnel qualifié.
- Déployer et valider la configuration des volumes PostgreSQL/Keycloak/RabbitMQ/MinIO existants et MFA Finance/Super Admin.

## Dépendances externes bloquantes

1. `BLOCKED_EXTERNAL:FLEXPAY_API` — contrat marchand officiel et accès sandbox/production.
2. `BLOCKED_EXTERNAL:LEGAL_COMPANY_DATA` — identité légale du vendeur, coordonnées et informations fiscales réelles.
3. `BLOCKED_EXTERNAL:LEGAL_REVIEW` — validation des règles de taxes, remboursements, juridictions et durées de conservation par les responsables compétents.
4. `BLOCKED_ENVIRONMENT:DOCKER_RUNTIME` — Docker Desktop doit être démarré pour vérifier les services, volumes, migrations et restauration locale.

## Ordre de réalisation proposé

1. Phase 0: installation reproductible, compilation/tests de base, observabilité et sécurité infra.
2. Phases 1–6: supprimer les écarts de suppression/privacy, médias, visuel, performances et tests des parcours existants.
3. Phases 7–8: conformité commerciale/factures puis provider réel une fois FlexPay documenté.
4. Phases 9–10: distribution, préflight, tests de rendu/charge et contrôle d’accès robuste.
5. Phase 11: console admin complète, audit enrichi, métriques business et exploitation.
6. Rejouer l’E2E du parcours maître et ne marquer une phase terminée qu’après ses critères de Done.
