# Critères de préparation production

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PARTIAL**

Passage production requiert des environnements isolés, TLS, secret store, SMTP réel contrôlé, fournisseur paiement officiel contractuel, policy legal/data validée, migrations vérifiées, backups et restore drill, tests owner isolation, monitoring/alert route, rate limiting et sécurité reverse proxy, capacité mesurée, rollback éprouvé, support/escalade.

Ces critères sont une liste actionnable, non l’affirmation que tous les mécanismes existent déjà. Appuyer chaque PASS sur commit+run ID+evidence.
