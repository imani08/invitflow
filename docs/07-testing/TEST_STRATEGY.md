# Stratégie de test

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

## Niveaux

- Unit: services, parseurs, règles état/idempotence, composants purs et package design-document.
- Integration: PostgreSQL/RabbitMQ/MinIO/Keycloak/proxy à exécuter contre stacks isolées et services réels simulés ou test.
- Contract: API DTO, event envelopes, audience OIDC, signatures provider/MinIO, interop snapshot renderer.
- E2E navigateur: création profil/event/import/seat/design/batch/RSVP/check-in; auth email; admin/agency/partner.
- Security: plan `04-security/SECURITY_TEST_PLAN.md`, A/B access, IPN, files, QR, web sessions.
- Performance/accessibility/mobile: plans dédiés; aucune mesure PASS sans rapport récent.
- Payment sandbox: bloqué jusqu’au contrat et credentials autorisés.

## Répertoire de preuves

`services/*/*.spec.*`, `packages/design-document/test/`, `apps/web/src/**/*.test.mjs`, `load-tests/k6/`. `pnpm test` utilise Turbo plus tests racine; services avec scripts propres. Le CI Node version/matrix est décrit dans README/workflow source.

## Traceabilité indicative

| Requis | Famille tests |
|---|---|
| FR-AUTH | `apps/web/src/lib/email-verification.test.mjs`, session refresh; Keycloak runtime manquant |
| FR-EVENT | Events date/program specs |
| FR-GUEST | import parser/list specs |
| FR-SEAT | capacity/guests specs |
| FR-DESIGN / FR-AI | DesignDocument/Designs/AI tests |
| FR-INV | Invitations token/layout/image/service specs |
| FR-MEDIA | validation, antivirus, transcode, presign specs |
| FR-PAY / Wallet | payments provider/checkout/list, wallet ledger/routing specs |

Un test unitaire ne prouve pas un parcours connecté E2E.
