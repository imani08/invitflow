# Matrice alertes

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PARTIAL**

| Condition | Sévérité proposée | Signal disponible | Action |
|---|---|---|---|
| Gateway/DB/Redis exporter absent | SEV2 | Prometheus target alert | valider readiness/config et credentials |
| PostgreSQL connexions saturées | SEV2 | postgres exporter/alert rules | examiner pool et saturation avant scale |
| RabbitMQ backlog durable | SEV2/SEV3 | queue ready/unacked | examiner consumer/outbox et âge |
| Dead-letter non vide | SEV2 | queue DLX | capturer messages non PII, traiter cause, replay idempotent |
| Payments reconciliation anomaly | SEV1 finance selon exposition | DB issue/outbox | geler crédit/refund/payout, rapprocher preuve provider |
| Upload scanner failure | SEV2 sécurité | service health/error | ne pas marquer média ready; rétablir scanner |
| MinIO object mismatch | SEV1/2 | inventory/audit service | conserver échec fermé et restaurer/manually review |

Sévérités/action proposées car seuils et escalade ne sont pas validés. Signaux et règles effectives: `infrastructure/monitoring/alerts.yml`.
