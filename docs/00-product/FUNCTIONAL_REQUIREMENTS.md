# Exigences fonctionnelles

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

| ID | Exigence traçable au code | Statut | Source principale |
|---|---|---|---|
| FR-AUTH-001 | Authentifier via OIDC Authorization Code avec PKCE S256, state et nonce | IMPLEMENTED, runtime à vérifier | `apps/web/src/lib/auth-session.ts` |
| FR-AUTH-002 | Refuser la session Web sans email vérifié | IMPLEMENTED | `apps/web/src/lib/auth-session.ts` |
| FR-LEGAL-001 | Exiger l’acceptation légale serveur et en conserver les versions/horodatages | IMPLEMENTED dans le provider | `infrastructure/keycloak/providers/invitaflow-legal-acceptance/` |
| FR-EVENT-001 | Créer, lire, modifier, publier/annuler un événement et gérer ses cérémonies | IMPLEMENTED | `services/events/src/events.controller.ts` |
| FR-GUEST-001 | Gérer invités, groupes, accès cérémonie et imports CSV/XLSX | IMPLEMENTED, runtime à vérifier | `services/guests/src/guests.controller.ts` |
| FR-SEAT-001 | Gérer tables, zones, placements et import de plan | IMPLEMENTED | `services/seating/src/seating.controller.ts` |
| FR-DESIGN-001 | Enregistrer des designs et versions JSON associés à un événement | IMPLEMENTED | `services/designs/src/designs.controller.ts` |
| FR-AI-001 | Créer/suivre des jobs d’assistance et de composition selon le fournisseur configuré | PARTIAL | `services/ai-design/README.md` |
| FR-INV-001 | Créer des lots avec instantanés immuables, réservation de crédits et rendu PDF/ZIP | IMPLEMENTED, runtime à vérifier | `services/invitations/README.md` |
| FR-RSVP-001 | Afficher une invitation publique et accepter une réponse par cérémonie | IMPLEMENTED | `services/invitations/src/invitations.controller.ts` |
| FR-CHECKIN-001 | Contrôler l’accès d’un invité par cérémonie avec unicité d’entrée | IMPLEMENTED | `services/invitations/prisma/schema.prisma` |
| FR-PAY-001 | Créer un ordre à partir du catalogue Billing avec clé d’idempotence | IMPLEMENTED | `services/payments/README.md` |
| FR-PAY-002 | Accorder des crédits uniquement après événement de paiement vérifié | IMPLEMENTED dans les consommateurs, intégration à vérifier | `services/wallet/src/payment-consumer.ts` |
| FR-AGENCY-001 | Administrer workspace, membres, clients et quota agence | PARTIAL | `services/events/prisma/schema.prisma` |
| FR-PARTNER-001 | Tracer attribution et commissions partenaires | PARTIAL | `services/payments/prisma/schema.prisma` |
| FR-MEDIA-001 | Recevoir et vérifier un média avant publication dans le bucket privé prêt | IMPLEMENTED | `services/media/README.md` |
| FR-PROFILE-001 | Lire/modifier le profil et gérer une demande de suppression | IMPLEMENTED | `services/profile/src/profile.controller.ts` |
