# Sauvegarde et restauration

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Référence implémentée : `docs/OPERATIONS_BACKUPS.md`, `scripts/backup-postgres.mjs`, `scripts/restore-postgres.mjs`. pg_dumpall inclut toutes bases/rôles et données sensibles; archive chiffrée, restreinte et hors Git. Objets MinIO ne sont pas couverts par dump PostgreSQL: les répliquer dans emplacement indépendant avec credentials least-privilege et checksum/versions.

Ordre restore proposé: créer cible isolée vide → restaurer PostgreSQL cluster/roles → aligner migrations → restaurer buckets au même point de reprise → config/secrets compatibles → bootstrap sans remplacer données → smoke auth/owner/event/wallet/invitation/object checks → basculer trafic contrôlé.

Drill réel NOT TESTED; RPO/RTO et durée de rétention non approuvés.
