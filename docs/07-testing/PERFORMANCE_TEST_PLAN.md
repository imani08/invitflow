# Plan de performance

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PLANNED**

Les scripts k6 existants couvrent RSVP, lots d’invitations, guest search et check-in (`load-tests/k6`). Avant mesure, utiliser base et identité de test, purger fixtures, vérifier quotas et coûts. Cibles à approuver: p50/p95/p99, débit, concurrence et erreur par endpoint; aucun seuil SLA validé n’est défini dans le dépôt.

Scénarios: liste invités et curseurs, recherche guest, RSVP public, check-in concurrent, lots de rendu, upload/scanner, jobs IA avec quota, checkout/init/provider mock, retries queue. Mesurer CPU/mémoire DB/Redis/Rabbit/Chromium, queue age/DLQ et objet MinIO.
