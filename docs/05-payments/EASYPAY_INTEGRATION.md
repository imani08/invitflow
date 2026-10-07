# Intégration EasyPay état actuel

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **NOT VERIFIED**

Le code et notes de phase antérieurs peuvent contenir une intention EasyPay. La source opérationnelle la plus actuelle à confirmer reste `services/payments/README.md` et le code `services/payments/src/providers/`: FlexPay est le seul adapter externe nommé actif mais non fonctionnel faute de contrat; Mock reste le fournisseur de test. Aucune route/structure EasyPay/IPN, méthode d’auth ou mapping de statuts ne doit être inventé.

Avant activation: obtenir documentation officielle RDC, CID/token sandbox, formats/headers, statut final checking-status, preuve IPN, montants/monnaies, délais, refunds et cas d’erreur; valider via serveur; masquer secrets; tester duplicate/out-of-order/mismatch; puis seulement activer une sélection de fournisseur explicitement documentée.

**État: NOT VERIFIED / BLOCKED_PROVIDER_CONTRACT.** Voir aussi `docs/PAYMENTS_EASYPAY.md` pour l’historique de conception.
