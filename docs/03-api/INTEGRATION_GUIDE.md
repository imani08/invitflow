# Guide d’intégration

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

1. Passer par Gateway ou BFF documenté; ne pas exposer les endpoints service internes.
2. Obtenir un access token Keycloak adapté à l’audience du service et vérifier que le scope/client la fournit.
3. Pour les mutations async/financières, réutiliser une clé d’idempotence stable par opération logique.
4. Respecter les formats DTO et contrôles de taille du contrôleur propriétaire; ISO-8601 avec offset et IANA timezone pour Events.
5. Gérer pagination cursor si fournie; éviter retry aveugle non idempotent.
6. Pour les événements, consumer doit dédupliquer event ID, traiter une transaction localement et ack seulement après commit.
7. Utiliser les environnements Mock/Mailpit pour local. Aucun secret merchant ou SMTP dans navigateur, dépôt ou logs.

Contrats d’intégration externes FlexPay/EasyPay réels: NOT VERIFIED; demander la documentation fournisseur, ne pas extrapoler endpoints.
