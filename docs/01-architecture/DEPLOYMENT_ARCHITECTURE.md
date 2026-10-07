# Architecture de déploiement

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

`compose.yaml` décrit la topologie de développement. Les réseaux Docker isolent données, identité, application, stockage, messaging, scan média et observabilité. PostgreSQL/Redis/RabbitMQ ne sont pas publiés comme interfaces publiques dans le guide de dépôt; les interfaces dev sont généralement liées à localhost. Les valeurs, profiles, ports et healthchecks exacts sont la source de vérité.

Image Node des projets, image Keycloak custom (provider légal), provisionneurs one-shot, PostgreSQL init, Keycloak init audiences/legal/email, MinIO bootstrap, renderer et services applicatifs démarrent dans un ordre explicite `depends_on`. Un `depends_on` réussi ne prouve pas qu’une intégration fonctionnelle marche.

Ce Compose n’est pas un manifeste de production : aucune topologie HA/cluster, gestionnaire de secrets externe, stratégie rolling deploy ou SLA n’est documentée comme implémentée.
