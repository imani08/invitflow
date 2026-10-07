# Plan de captures documentaires

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow

Aucune capture n’a été générée. Chaque capture doit provenir d’un navigateur/runtime réel avec données de démonstration fictives et sans secrets/PII. Les routes marquées runtime à relever doivent être confirmées avant capture.

## End-user

| ID | Guide | Screen | Route | Desktop/Mobile | Light/Dark | Required account/role | Status | Filename | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 01-public-home | End-user | Accueil public | `/` | Desktop + Mobile | Light + Dark | Tout visiteur | NOT GENERATED | `01-public-home.png` | Noter viewport desktop/mobile et thème |
| 02-registration | End-user | Inscription | `Keycloak / route runtime à relever` | Desktop + Mobile | Light + Dark | Visiteur fictif | NOT GENERATED | `02-registration.png` | Masquer adresse du compte de test |
| 03-legal-consent | End-user | Consentement légal | `Keycloak registration form` | Desktop + Mobile | Light + Dark | Visiteur fictif | NOT GENERATED | `03-legal-consent.png` | Afficher versions des textes et cases |
| 04-email-verification | End-user | Vérification email | `Lien d’action Keycloak` | Desktop + Mobile | Light + Dark | Compte fictif | NOT GENERATED | `04-email-verification.png` | Boîte de test uniquement |
| 05-login | End-user | Connexion | `Keycloak login / URL runtime à relever` | Desktop + Mobile | Light + Dark | Compte fictif | NOT GENERATED | `05-login.png` | Ne jamais montrer tokens ou URL à usage unique |
| 06-dashboard | End-user | Dashboard | `/dashboard` | Desktop + Mobile | Light + Dark | Organisateur | NOT GENERATED | `06-dashboard.png` | Données de démonstration clairement fictives |
| 07-create-event | End-user | Création événement | `/events` | Desktop + Mobile | Light + Dark | Organisateur | NOT GENERATED | `07-create-event.png` | Formulaire réel |
| 08-event-ceremonies | End-user | Cérémonies | `/events/:eventId` | Desktop + Mobile | Light + Dark | Organisateur propriétaire | NOT GENERATED | `08-event-ceremonies.png` | Utiliser événement fictif |
| 09-guests | End-user | Invités | `/events/:eventId/guests` | Desktop + Mobile | Light + Dark | Organisateur propriétaire | NOT GENERATED | `09-guests.png` | Noms/adresses fictifs |
| 10-guest-import-guide | End-user | Guide import invités | `/events/:eventId/guests` | Desktop + Mobile | Light + Dark | Organisateur propriétaire | NOT GENERATED | `10-guest-import-guide.png` | Montrer modèle si disponible |
| 11-excel-import-preview | End-user | Aperçu import Excel | `/events/:eventId/guests` | Desktop + Mobile | Light + Dark | Organisateur propriétaire | NOT GENERATED | `11-excel-import-preview.png` | Fichier de fixture synthétique |
| 12-seating | End-user | Placement | `/events/:eventId/seating` | Desktop + Mobile | Light + Dark | Organisateur propriétaire | NOT GENERATED | `12-seating.png` | Fixture de sièges |
| 13-design-editor | End-user | Éditeur design | `/events/:eventId/designs` | Desktop + Mobile | Light + Dark | Organisateur propriétaire | NOT GENERATED | `13-design-editor.png` | Visuel autorisé |
| 14-invitation-preview | End-user | Aperçu invitation | `/events/:eventId/invitations` | Desktop + Mobile | Light + Dark | Organisateur propriétaire | NOT GENERATED | `14-invitation-preview.png` | Contenu fictif uniquement |
| 15-wallet | End-user | Wallet | `/account/wallet` | Desktop + Mobile | Light + Dark | Organisateur | NOT GENERATED | `15-wallet.png` | Solde de démonstration |
| 16-payment-checkout | End-user | Checkout | `Provider test uniquement; route à relever` | Desktop + Mobile | Light + Dark | Compte sandbox autorisé | NOT GENERATED | `16-payment-checkout.png` | Aucun moyen réel ou secret |
| 17-rsvp | End-user | RSVP | `/invite/:token` | Desktop + Mobile | Light + Dark | Invité de démonstration | NOT GENERATED | `17-rsvp.png` | Token temporaire de fixture, flouter après parcours |
| 18-checkin | End-user | Check-in | `/events/:eventId/check-in` | Desktop + Mobile | Light + Dark | Organisateur/agent autorisé | NOT GENERATED | `18-checkin.png` | QR de démonstration |
| 19-contact | End-user | Contact | `/contact` | Desktop + Mobile | Light + Dark | Tout visiteur | NOT GENERATED | `19-contact.png` | Aucune conversation client réelle |
| 20-legal-index | End-user | Index légal | `/legal` | Desktop + Mobile | Light + Dark | Tout visiteur | NOT GENERATED | `20-legal-index.png` | Textes publiés et version à noter |

## Admin — pages existantes

| ID | Guide | Screen | Route | Desktop/Mobile | Light/Dark | Required account/role | Status | Filename | Notes |
|---|---|---|---|---|---|---|---|---|---|
| ADM-01 | Admin | Console support/modération | `/admin` | Desktop + Mobile | Light + Dark | Support ou Super Admin | NOT GENERATED | `admin-01-moderation.png` | Capture seulement après vérification du rôle effectif. |
| ADM-02 | Admin | Finance / paiements | `/admin/finance` | Desktop + Mobile | Light + Dark | Finance Admin | NOT GENERATED | `admin-02-finance.png` | Capture seulement après vérification du rôle effectif. |
| ADM-03 | Admin | Tarification | `/admin/pricing` | Desktop + Mobile | Light + Dark | Finance Admin | NOT GENERATED | `admin-03-pricing.png` | Capture seulement après vérification du rôle effectif. |
| ADM-04 | Admin | Partenaires | `/admin/partners` | Desktop + Mobile | Light + Dark | Finance Admin | NOT GENERATED | `admin-04-partners.png` | Capture seulement après vérification du rôle effectif. |
| ADM-05 | Admin | Stockage | `/admin/storage` | Desktop + Mobile | Light + Dark | rôle autorisé par route | NOT GENERATED | `admin-05-storage.png` | Capture seulement après vérification du rôle effectif. |
| ADM-06 | Admin | Analytics | `/admin/analytics` | Desktop + Mobile | Light + Dark | rôle administrateur | NOT GENERATED | `admin-06-analytics.png` | Capture seulement après vérification du rôle effectif. |
