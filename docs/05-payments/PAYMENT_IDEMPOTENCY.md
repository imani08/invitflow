# Idempotence et réconciliation paiement

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Le `POST /v1/payments` prend une `Idempotency-Key`; ordre/paiement enregistrent les refs, tentatives et snapshot catalogue. Un compare-and-set évite plusieurs initialisations concurrentes. Références transaction fournisseur et reçus webhook ont contraintes uniques. Une confirmation serveur, changement ordre et outbox sont dans une transaction DB. Wallet applique un idempotency key payment-scoped.

Pour exploiter: préserver même clé sur retry client d’une seule action, distinguer nouvel achat d’un retry, ne jamais considérer return URL comme vérification, garder mismatch en anomalie et vérifier DLQ. Voir `services/payments/README.md`, `payments.service.ts`, `wallet/payment-consumer.ts`.
