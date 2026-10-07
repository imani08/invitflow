# C4 contexte système

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

InvitaFlow fournit un workspace d’organisation et d’invitation. L’organisateur prépare événement, invités et design; les invités reçoivent un lien pour consulter et répondre. L’équipe support/finance utilise des vues protégées. Keycloak gère l’identité, le fournisseur de paiement traite le checkout, et MinIO/SMTP/RabbitMQ sont des systèmes techniques externes ou infrastructurels.

Voir `diagrams/sources/system-context.mmd` et ses exports. Les intégrations externes réellement qualifiées sont limitées : Mock local est implémenté; FlexPay est un adaptateur incomplet; l’API EasyPay réelle n’est pas démontrée.
