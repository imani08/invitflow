# Audit architecture — constats et limites

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **STATIC AUDIT ONLY**

## Périmètre

Lecture statique des sources et README présents dans le dépôt au 2026-10-07. Aucun Docker, environnement staging/prod, navigateur authentifié ni base déployée n’a été interrogé pendant la production documentaire.

## Observations

- Monorepo avec frontends séparés, gateway API et services de domaine NestJS/Prisma.
- Les frontières de données et ownership par service sont documentés dans `02-data/DATABASE_OWNERSHIP.md`.
- Les échanges asynchrones utilisent outbox, RabbitMQ et consommateurs idempotents dans plusieurs domaines.
- Paiement réel non démontré: le README Payments déclare FlexPay bloqué sans contrat marchand; ancien nom EasyPay ne constitue pas preuve d’intégration opérationnelle.
- L’application admin est actuellement un shell orientant vers l’interface Web; pas de preuve d’un second système admin indépendant.
- Les modèles agency/partner existent, avec fonctionnalités partielles.
- Les procédures sont documentées mais aucun exercice de restauration ou incident n’est attesté ici.

## Risques et suites

Confirmer contrats externes; exécuter authentification/registration/email en staging; vérifier migrations et configuration réelle; tester pannes RabbitMQ/MinIO/Mailpit/SMTP; mesurer reprise sauvegarde; obtenir approbation juridique; réaliser audit complet rôles/ownership/tenant; fixer SLO/capacité; capturer parcours navigateur réel.
