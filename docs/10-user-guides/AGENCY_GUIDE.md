# Guide agence InvitaFlow

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PARTIAL**

Le schéma Events contient `AgencyWorkspace`, membership/roles, clients/client events, subscriptions et quota reservation. Ces fonctions sont **PARTIAL** : il faut vérifier chaque endpoint/UI et droits par compte avant mise en service.

Guide de base: agence crée workspace si route/permission disponible; owner/admin ajoute membre avec rôle disponible; associe client/événement; vérifie quota/abonnement avant opération; suit rapport réellement exposé. Ne pas supposer équipe multi-workspace ou renouvellement automatique s’il n’est pas exposé et testé.

Captures réelles non générées. Propriétaire doit compléter ce guide après walkthrough vérifié de l’espace Agency.
