# Plan de retour arrière

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

1. Détecter régression et arrêter l’extension trafic; préserver IDs/error/metrics et n’interrompre pas transaction financière au milieu sans vérifier.
2. Geler workers/consumers seulement selon runbook, capturer outbox/queue/DB state, empêcher doubles effets.
3. Revenir à une image précédente uniquement si schema backward-compatible; sinon appliquer procédure forward fix ou restore isolé approuvé.
4. Ne jamais `down -v`, reset DB, delete ledger/outbox, rejouer DLQ non idempotent.
5. Vérifier checkout orders, wallet invariants, access sessions, renders/object links puis rouvrir workers.
6. Communiquer état/impact; consigner décisions et preuve.

Migrations rollback spécifique n’est pas garanti par Prisma; élaborer migration corrective testée pour chaque release. Contact opérateur: email/téléphone au README.
