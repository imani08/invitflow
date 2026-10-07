# Guide déploiement

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PARTIAL**

Compose décrit le développement local. Un déploiement réel doit dériver une configuration dédiée, TLS/proxy, secret store, DB/broker/object store managés ou durcis, sauvegardes externes, réseau minimal, image pinning/SBOM, permissions, alerting et release progressive. Aucune topologie production HA complète n’est déclarée prête ici.

Checklist: revue diff/migrations, tests+build CI, variables requises par service sans valeurs en Git, nouveau realm/provider/bootstrap, SMTP `smtp` explicit, clés HMAC et audiences, migrations dans l’ordre contrôlé, readiness et smoke tests, alertes/backup, plan rollback. Ne pas exporter port de DB/broker vers public. Aucun EasyPay token/client ID dans navigateur.
