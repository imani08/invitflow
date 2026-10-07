# Abstraction des fournisseurs de paiement

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PARTIAL**

Payments dépend de l’interface `PaymentProvider`, possède les ordres/attempts et orchestre les transitions. `MockPaymentProvider` est le chemin de développement. `FlexPayProvider` est présent mais README indique que contrat marchand et sandbox ne sont pas disponibles; il refuse volontairement checkout/vérification/refund. Des traces CinetPay historiques restent dans `provider` sans adapter vérificateur actif.

Ne pas conclure qu’EasyPay est prêt parce que des docs/variables de phase précédente existent : comparer `docs/PAYMENTS_EASYPAY.md` au code provider actuel. Aucun appel réel n’est attesté par les tests provider qui mockent fetch.

Un retour frontend ne crée pas de crédit. La preuve serveur met à jour le paiement et outbox atomiquement; Wallet traite les événements avec clé de ledger idempotente. Remboursement réel/settlement exige vérification fournisseur et politique finance.
