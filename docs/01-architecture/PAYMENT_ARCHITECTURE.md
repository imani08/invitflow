# Architecture de paiement

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PARTIAL**

Billing fournit prix/packs/règles versionnés. Payments crée un ordre à instantané, choisit un `PaymentProvider`, tente le checkout et enregistre changements/outbox. Un signal de retour navigateur ne constitue pas la preuve de paiement : la vérification serveur du fournisseur est requise avant `payment.succeeded`. Wallet consomme l’événement avec idempotence pour créditer le ledger.

`MockPaymentProvider` permet le développement. Le contrat marchand FlexPay RDC est indiqué indisponible; l’adapter refuse volontairement les opérations réelles. EasyPay n’est pas établi comme fournisseur effectif dans les README actuels. Voir `services/payments/README.md`, `docs/PAYMENTS_EASYPAY.md`, `services/payments/src/providers/`.
