# Catalogue des événements métier

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PARTIAL**

| Event type observé | Producteur | Consommateur / usage | Version / livraison |
|---|---|---|---|
| `payment.created.v1` | Payments | analytics/finance selon routage | outbox, version 1 |
| `payment.succeeded.v1` et `.v2` | Payments | Wallet crédit achats; autres projections | confirmé serveur, outbox transactionnelle |
| `payment.failed.v1` | Payments | projection/notifications selon routage | outbox |
| `payment.refunded.v1` et `.v2` | Payments | Wallet reversal pour v1 vérifié | outbox/idempotency |
| `payment.reconciliation-anomaly.v1` | Payments | supervision finance | outbox |
| `billing.price-schedule-published.v1` | Billing | projections/consommateurs configurés | outbox |
| `guest.created.v1`, `guest.updated.v1`, `guest.archived.v1` | Guests | notifications/analytics/audit selon binding | envelope versionnée |
| `guest.import.started/validated/completed.v1` | Guests | parcours async et analytics | outbox, job d’import |
| `seating.tables.imported.v1`, `seating.assignment.saved.v1` | Seating | notifications/analytics selon routing | outbox |
| `invitation.render.requested.v1` | Invitations | worker Rendering | queue durable, job DB reprenable |
| `invitation.rsvp.updated.v1` | Invitations | notifications organisateur | outbox |
| `media.background-removal.requested.v1` | Media | worker traitement image | outbox |
| `guest.import.expired.v1` | Guests | audit/projections selon binding | outbox |

L’enveloppe emploie `eventId`, `eventType`, `eventVersion`, `occurredAt`, `producer`, `correlationId`, `causationId`, `payload` dans plusieurs publishers. Le retry/attempts/DLX diffère par consumer; par exemple Notifications a limite de dix tentatives et DLX, Wallet indique retry 30 s puis dead queue. Le catalogue est le résultat des chaînes littérales actuelles, pas un contrat exhaustif. Binding exact et ordering doivent être revérifiés dans `infrastructure/rabbitmq/definitions.json` et consumers.
