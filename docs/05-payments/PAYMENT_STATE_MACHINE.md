# États des ordres et paiements

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Enums actuels `PaymentStatus`: `CREATED`, `PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `EXPIRED`, `REFUND_PENDING`, `REFUNDED`. `OrderStatus`: `CREATED`, `PAID`, `CANCELLED`, `REFUNDED`. Ce n’est pas un workflow complet et séquence exacte doit être prise du Payments service.

Diagramme : `diagrams/sources/payment-state-machine.mmd`. Un succès ne doit venir qu’après confirmation provider; le diagramme ne remplace ni invariants ni transaction.
