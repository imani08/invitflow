# Intégration visuelle Figma Make — analyse et suivi

## Références

- Référence d’architecture et de comportement : InvitaFlow (`apps/web`, Gateway, microservices, sessions OIDC/Keycloak, Prisma/PostgreSQL).
- Référence visuelle/UX : export Figma Make (`D:\invitflow\figma-invitaflow`).
- L’export contient `src/App.tsx`, `src/context.tsx`, `src/types.ts`, `src/components/{Sidebar,BottomNav,Header,ui}.tsx`, `src/screens/*.tsx` (32 écrans), `src/index.css`, Vite/Tailwind config et `package.json` React 19/Vite 8/Tailwind 4.

## Inventaire Figma et mapping fonctionnel

| Écran Figma Make | Route InvitaFlow / correspondance | État et décision d’intégration |
| --- | --- | --- |
| Landing | `/` | Correspondance directe; présentation publique, CTA OIDC. |
| Auth | `/api/auth/login`, callback `/api/auth/callback`, thème Keycloak | Le formulaire Figma simule la connexion; conserver le flux PKCE/OIDC et le thème Keycloak existant. |
| Onboarding | Pas de route onboarding dédiée; `/account` et profil | Écran produit absent. À concevoir selon les données/étapes API réellement disponibles; ne pas reprendre le wizard factice. |
| Dashboard | `/dashboard` (ajout) | Synthèse volontairement limitée au prénom OIDC et aux événements réellement retournés par l’API; aucun chiffre agrégé absent du backend. `/events` reste la liste de référence. |
| Events | `/events` | Liste réelle, état vide/indisponible, cartes et actions conservés; lien vers les cérémonies présélectionne l’événement sans changer l’API. |
| CreateEvent | formulaire progressif sur `/events#create-event` | Première étape réduite à type, nom et date/fuseau; description facultative. Le backend ne persiste pas lieu ni estimation au niveau événement: lieu/capacité sont configurés par cérémonie, volume d’invités depuis les invités réels. La création ouvre le panneau de cérémonies de l’événement créé. |
| EventDetail | `/events/[eventId]` | Correspondance directe; données réelles et parcours existant, styles responsive harmonisés. |
| Ceremonies | éditeur existant dans `/events?event=<id>` | Ajout/édition/suppression, types mariage civil/religieux/dot/traditionnel/réception/personnalisé (`OTHER`) et programme restent reliés aux APIs existantes. |
| Guests | `/events/[eventId]/guests` | Liste paginée, recherche, filtres, accès par cérémonie, table/RSVP/statuts selon données existantes, formulaire manuel, import CSV/XLSX en dépôt/choix, mapping, aperçu et confirmation. |
| GuestProfile | Aucun détail invité autonome | Pas de route dédiée; actions/détails invités doivent rester dans le workspace existant tant qu’une page/API de détail n’est pas définie. |
| Tables | `/events/[eventId]/seating` | Correspondance directe avec plan de salle/cérémonies. |
| Templates | `/events/[eventId]/designs` (choix de modèles) | Fonction intégrée au parcours Designs; aucun faux catalogue ne doit être importé. |
| Editor | `/events/[eventId]/designs` | Éditeur réel des documents/layers; conserver versionnement et assets privés. |
| Preview | workspace Designs / `/events/[eventId]/invitations` | Aperçu réel existant; ne pas dupliquer les données d’exemple Figma. |
| PublicInvitation | `/invite/[token]` | Correspondance directe avec token signé et RSVP réel. |
| CheckIn | `/events/[eventId]/check-in` | Correspondance directe avec permission opérateur et scan/QR réels. |
| Stats | pas d’analytics événement dédié; `/admin/analytics` est une autre audience | Écran événement manquant; métriques uniquement quand un endpoint réel les expose. |
| Wallet | `/account/wallet` | Solde/crédits, ledger et catalogues réels déjà disponibles; montants seulement au checkout. |
| Pricing | `/account/wallet`, `/agencies` | Réutiliser le catalogue Billing versionné; ne pas importer les packs codés en dur. |
| Payment | `/account/wallet` / `PaymentActions` | Checkout et états de paiement réels; pas d’écran succès simulé. |
| Notifications | `/account/notifications` | Correspondance directe et inbox API. |
| Profile | `/account` | Correspondance directe et profil API. |
| Security | `/account` / paramètres OIDC gérés par Keycloak | Pas de nouvelle route sécurité autonome; sessions et paramètres d’identité existants font foi. |
| Preferences | `/account` | Réglages existants à inventorier avant extension. |
| Agency | `/agencies` | Dashboard workspace réel; ne pas reprendre clients/chiffres fictifs. |
| Agency Clients | `/agencies` | Fonction dépend des ressources/client APIs existantes; aucun écran Figma séparé à copier. |
| Agency Team | `/agencies` | Membres gérés par workspace/API, avec permissions actuelles. |
| Agency Billing | `/agencies` et `/account/wallet` | Checkout plans agence via Billing; pas d’USD affichés comme solde. |
| Partners | `/partners`, `/referral` | Profil, attributions, ledger et empty states réels. |
| Support | `/contact`, `/account/report` | Correspondance partielle; garder le signalement/audit réel et ne pas simuler l’envoi d’un ticket. |
| Legal | `/legal`, `/terms`, `/privacy`, `/cookies`, `/sales-terms`, `/refund-policy` | Documents existants, certains états peuvent rester brouillon/non indexables. |
| Error | `not-found.tsx`, erreurs propres aux routes/services | Gérer erreurs réelles de route/service sans page d’erreur simulée du prototype. |

Les fonctions non représentées par un écran Figma restent conservées : programme de cérémonie et son édition, QR/RSVP/check-in, audit/modération, politiques légales, export/suppression de compte, paiements et administration.

## Composants, styles, assets et animations Figma

- Composants visuels réutilisables : `Button`, `Input`, `Textarea`, `Select`, `Card`, `Badge`, `Avatar`, `Progress`, `Steps`, `Tabs`, `Modal`, `Toggle`, `Checkbox`, `Alert`, `StatCard`, `EmptyState`, `SkeletonCard`, `SectionHeader`; icônes inline SVG; Sidebar/BottomNav/Header.
- Styles: Tailwind CSS v4 utilities, palette violet/or/crème, typographies Fraunces, Plus Jakarta Sans et JetBrains Mono, classes `glass`, gradients, cards à coins arrondis, skeleton/shimmer.
- Animations: fade-up/fade-in/scale-in/slide-up, float, shimmer, pulse-ring, hover-lift et transitions. Toute animation portée dans InvitaFlow doit être neutralisée avec `prefers-reduced-motion`.
- L’export ne fournit pas de répertoire d’images de produit sous `src`; les photos de démonstration utilisent des URLs Unsplash distantes. Elles ne sont pas importées comme données/assets de production. L’identité et le logo locaux InvitaFlow restent prioritaires.

## Conflits et risques

1. Le prototype est une SPA Vite à switch d’état local; InvitaFlow est App Router Next.js avec rendu serveur, routes explicites et sessions chiffrées/Redis. Ne pas reprendre `App.tsx`, `AppProvider`, `Screen`, faux login/logout ou routing simulé.
2. Les écrans Figma contiennent noms, événements, statistiques, RSVP, crédits, transactions, tarifs, notifications, clients et commissions d’exemple codés en dur. Ils ne peuvent pas être affichés en production.
3. Auth du prototype bypasse Keycloak; celle-ci doit rester un redirect OIDC PKCE. Le thème `infrastructure/keycloak/themes/invitaflow` existe et garde templates/actions MFA Keycloak.
4. Dépendances: React 19 partageable, mais `vite`, Tailwind 4, plugins Figma Make et `oxfmt` n’ont pas leur place dans `apps/web` Next 15.5. Pas de dépendance Figma Make nécessaire; styles CSS natifs/React existant suffisent.
5. Palette Figma violet/or/crème peut être adaptée aux couleurs officielles violet profond/or du logo existant. Pas d’écrasement des feuilles métier propres aux workspaces.
6. Au début de l’intégration, plusieurs routes n’avaient pas de shell ou thème partagé. Le shell global, le Dashboard et un ThemeProvider avec contrôle clair/sombre ont depuis été ajoutés; certains écrans spécialisés gardent leurs propres règles et demandent encore une QA authentifiée.
7. L’export a un CSS de `prefers-reduced-motion`; le front InvitaFlow a déjà cette convention dans plusieurs pages, à conserver/étendre.

## Ordre d’intégration

1. DONE première tranche: landing publique dans la direction visuelle du prototype et shell de navigation de l’application (sidebar desktop, barre mobile fixe à cinq destinations max), avec les routes réelles existantes. Auth conserve Keycloak.
2. DONE (UI, logique existante): parcours principal Dashboard, Events, création, vue événement, cérémonies/programme, invités et import Excel/CSV. Les contrats/API n’ont pas été modifiés. Responsive/CSS ajouté; tests de navigateur authentifiés à terminer quand Keycloak et Gateway sont disponibles.
3. PARTIAL: Designs/Templates/Editor/Preview harmonisés sur leurs données/API actuelles; génération/PDF reste hors de cette tranche.
4. PARTIAL: invitation publique RSVP et check-in/QR, wallet/crédits/paiement, avec vérification des états de vérité backend.
5. PARTIAL: agency/team/clients/subscription puis Partners/referrals/commissions.
6. NOT STARTED: onboarding, GuestProfile autonome, dashboard agrégé et statistiques événement uniquement après clarification des contrats/données API nécessaires.
7. Admin secondaire; le stockage, modération, finance et console existants ne sont pas redessinés dans la première passe.

## Intégration Figma Make — Designs, Templates, placement et aperçu (4 octobre 2026)

### DONE
- `/events/[eventId]/seating`: repères visuels des places restantes, état complet, capacité dépassée et capacité non définie dans le plan, les listes et destinations. Données issues des places/affectations de l’API; recherche, affectation/déplacement et actions existantes conservés.
- `/events/[eventId]/designs`: catalogue réel avec recherche nom/description/catégorie/style/tags et filtres de catégorie/cérémonie, illustration de style explicitement fondée sur les métadonnées disponibles (pas le rendu complet), états chargement/erreur/retry/vide, puis choix ouvrant le Design créé par l’API existante.
- L’éditeur expose sur les petits écrans des panneaux progressifs aperçu/calques/réglages. Les outils déjà persistés par Designs (texte, couleurs, typographie, images, historique, sauvegarde, versions/restauration) restent les seuls proposés.
- Aperçu personnalisé fondé sur un invité réel sélectionnable, une cérémonie réelle et une table assignée si disponible. Mention sans consommation de crédits; aucun QR réel, rendu final, PDF ou ZIP n’est déclenché.
- IA conserve les endpoints/jobs existants et les vrais états file/traitement/proposition/échec/retry/apply. Le mode local simulé reste explicitement étiqueté et n’est pas un résultat de production.
- Réutilisation de `events/journey.css`, AppNavbar et composants existants; styles locaux responsive, focus, préparation dark mode et `prefers-reduced-motion`. Aucun changement backend, dépendance ou donnée de démonstration.
- Avertissement Autoprefixer corrigé dans `events.css`: `align-items:end` devient `flex-end`.

### PARTIAL
- Designs/Billing ne fournit actuellement ni prix ni classification Gratuit/Premium. Aucun badge ni tarif n’est inventé; l’interface explicite cette limite.
- La preview du catalogue présente une illustration de style dérivée des métadonnées du template; ce n’est pas le rendu complet du document ni le rendu PDF final. La preview dans l’éditeur utilise le document réel.
- Le plan de salle reste une carte/liste fonctionnelle; la géométrie libre n’est pas persistée par le modèle actuel.
- Dark mode préparé localement, sans commutateur global.

### NOT TESTED
- QA visuelle navigateur authentifiée aux viewports 375 px, 768 px et desktop; OIDC/Gateway local n’était pas accessible, aucun bypass utilisé.
- Mutations Seating/Designs/AI, polling IA, assets privés, persistance DB et versions en runtime Docker.
- Build Next production et tests UI spécifiques à ces deux parcours.

### BLOCKED
- QA visuelle et interactions authentifiées bloquées par l’absence de session/services OIDC/Gateway locaux. Les routes ont répondu en dev derrière le redirect OIDC (307); la route Seating est confirmée compilée. Aucune session factice n’a été utilisée.

### VALIDATION
- Typecheck Web: réussi.
- ESLint ciblé: 0 erreur; 4 avertissements dans `designs/workspace.tsx` (effets React et `<img>` pour preview IA).
- Tests Web: 27/27 réussis après autorisation d’exécution hors sandbox; sandbox seul échouait au démarrage des workers avec `spawn EPERM`.
- Parse PostCSS des styles ciblés: réussi. `git diff --check`: réussi, avec avertissements Git LF/CRLF uniquement.

## Intégration Figma Make — Rendu, invitation publique et pointage (4 octobre 2026)

### DONE
- `/events/[eventId]/invitations`: récapitulatif avant génération (événement, design, nombre d’invités, plafond de réservation à 1 crédit/invitation, solde wallet réel si disponible, quota agence laissé au contrôle du backend). Confirmation native obligatoire, verrou synchrone anti-double-submit et idempotency key conservée. La preview reste gratuite; l’interface précise que la soumission réserve des crédits et que le règlement final dépend des PDF générés.
- La sélection distingue explicitement tous les invités de la sélection manuelle; compteur total réel fourni par l’API Guests, recherche locale et limite de 5 000 IDs respectée pour les sélections explicites.
- Suivi des lots basé sur statuts et compteurs serveur, barre calculée uniquement depuis traités/total réels, erreurs par item et téléchargement PDF seulement pour les items GENERATED ayant une objectKey. Le ZIP n’est proposé que pour un lot terminé non expiré/non supprimé; taille et date d’expiration uniquement si renvoyées; régénération réservée au ZIP expiré/supprimé et à l’endpoint existant.
- `/invite/[token]`: styles réutilisant les couleurs/tokens partagés; contenu inchangé aux champs réellement renvoyés (invité, événement, lieu, date, cérémonies autorisées, réponses et accompagnants). Affiche les réponses déjà enregistrées, permet leur mise à jour selon l’upsert backend, bloque les doubles soumissions et différencie erreurs invalides/indisponibilité. Token opaque conservé dans l’URL; aucune donnée d’autre invité ou QR fabriqué.
- `/events/[eventId]/check-in`: vue mobile prioritaire, gros CTA, scanner caméra QR existant ou saisie manuelle du même token opaque, résultat net autorisé/déjà pointé/refusé/invalide/erreur réseau, reprise sur erreur; aucun contournement du résultat backend. Résumé opérationnel affiche chargement/erreur avant les chiffres réels, plus actions d’actualisation.
- Les trois parcours réutilisent `journey.css` et `AppNavbar`; styles locaux ajoutés pour mobilité, contrastes, focus visible, dark mode préparé et reduced-motion. Endpoints publics, wallet, Invitations, Access et Check-in réutilisés; aucun changement backend, de crédits, QR, rôles, Gateway ou dépendance.
- Les 4 avertissements ESLint précédemment consignés dans `designs/workspace.tsx` ont été corrigés localement (dépendances d’effets rendues stables; composant Image non optimisé pour préserver l’accès direct à l’API d’aperçu authentifiée).

### PARTIAL
- L’API ne fournit pas d’aperçu individuel de consommation wallet/quota agence par sélection avant création. Le wallet personnel est montré lorsqu’il répond, et le quota agence est déclaré comme contrôlé au moment de la réservation par Invitations/Events; aucun chiffre composite n’est supposé.
- Les invités incomplets/invalides ne sont pas recensés par un endpoint de prévalidation. L’interface l’indique et laisse le service Invitations valider puis rapporter les échecs réels.
- L’API publique ne fournit pas table ou QR; ils ne sont donc pas affichés sur la page publique. Les données de table restent disponibles au pointage seulement si les endpoints de résultat les exposent (le contrat de scan courant ne renvoie pas la table).
- Le statut/rendu batch est observé en runtime uniquement si les services répondent. Aucune génération PDF/ZIP ni consommation de crédit réelle n’a été déclenchée pendant la validation.

### NOT TESTED
- Aucun parcours authentifié Invitations/Wallet/Check-in exécuté avec vraie session OIDC, vrai invité/token, caméra ou appareil physique.
- Aucun RSVP soumis, scan QR réel, génération PDF/ZIP, réservation/settlement de crédits ou mesure de taille ZIP validé contre les services/DB MinIO runtime.
- Build de production Next non exécuté. Aucun E2E service Invitations/Access/Wallet n’a été ajouté, le backend et ses règles n’ayant pas été modifiés.
- Vérification navigateur: l’état public d’indisponibilité avec token de test synthétique n’a pas de débordement horizontal à 375/768/1440 px; cette vérification ne vaut pas QA d’une invitation valide. Les pages privées redirigent OIDC avant affichage.

### BLOCKED
- Vérification visuelle authentifiée des pages privées et tests opérationnels réels nécessitent Keycloak/Gateway, Wallet, Events, Invitations, Access, PostgreSQL et MinIO disponibles avec des données de test autorisées.

### VALIDATION
- Typecheck Web: réussi; ESLint ciblé: 0 avertissement/erreur sur les fichiers parcourus, y compris les avertissements Designs corrigés.
- Tests Web: 27/27 réussis hors sandbox; tentative sandboxée bloquée avant exécution par `spawn EPERM` des workers Node.
- Next dev: `/events/[eventId]/invitations`, `/events/[eventId]/check-in` et `/invite/[token]` compilent; les deux pages privées renvoient 307 OIDC; page publique renvoie 200, puis endpoint public 503 sans backend local.
- PostCSS parse CSS cible et `git diff --check`: réussis; Git émet uniquement des avertissements de conversion LF/CRLF.

## Statut de la tranche actuelle

### DONE
- Inventaire complet des fichiers Figma visibles par arbre, écrans, composants, styles, animations, ressources et dépendances; mapping documenté ci-dessus.
- Landing locale refaite dans une direction éditoriale/plum-or, responsive et sans témoignages ou compteurs fictifs; CTA utilise la redirection OIDC réelle.
- AppNavbar remplace la barre horizontale générique par une sidebar desktop et une barre fixe mobile de cinq actions au plus, incluant les routes contextuelles d’événement. Logo officiel, signal actif, safe area et reduced-motion conservés.
- Parcours principal harmonisé visuellement: accueil Dashboard alimenté par le catalogue événementiel réel, liste, création progressive, aperçu événement, panneau cérémonies/programme, invités et import CSV/XLSX avec drag & drop, mapping, aperçu, erreurs et confirmation. La sélection d’une cérémonie depuis le parcours ouvre le même éditeur existant. Seating: correction du lien interne `<a>` en `Link` sans changement de destination/comportement.
- Aucun endpoint, modèle métier, permission, session OIDC, rôle, dépendance ou service backend modifié; aucun faux tableau de bord ajouté.

### PARTIAL
- Lieu et capacité restent renseignés par cérémonie, conformément au schéma/API actuel; aucune estimation d’invités au niveau événement n’est persistée. Le total réel apparaît dans l’espace invités une fois les personnes ajoutées.
- Le mode sombre est préparé avec variables et sélecteurs `html[data-theme="dark"]` / `.dark` sur cette tranche; aucun commutateur ou thème global n’existe encore dans l’App Router.
- Contrats ne retournant pas RSVP, table, check-in ou statut d’invitation dans la liste d’invités: seules les informations déjà fournies par le workspace sont affichées; aucune colonne synthétique ajoutée.

### NOT TESTED
- Build production Next et tests visuels authentifiés responsive sur `/dashboard`, `/events`, `/events/[eventId]`, cérémonies et invités à 375/768/desktop; le serveur local a redirigé vers `/?auth=unavailable` car l’auth/OIDC local n’est pas disponible.
- Les tests Web automatisés valident les modules existants, mais ne couvrent pas le rendu visuel navigateur ni les mutations API du parcours complet.

### BLOCKED
- Aucune dépendance installée; les écrans nécessitant des contrats API non disponibles sont différés et non simulés.
- Vérification runtime authentifiée bloquée tant que Keycloak/Gateway/services requis ne sont pas joignables localement; ne pas contourner par une session/mise en scène factice.

## Intégration Figma Make — Wallet, crédits et paiement (4 octobre 2026)

### DONE
- `/account/wallet` reprend plum/or/crème et `AppNavbar`, avec affichage responsive, focus visible, préparation dark mode et réduction du mouvement.
- Le solde est libellé exclusivement en crédits et distinct de l’historique de paiements. Packs/prix utilisent la grille réelle `GET /v1/pricing`; aucun rabais ou badge n’est inventé.
- Le parcours propose un récapitulatif issu du pack réel avant création, bloque le double envoi et appelle exclusivement `POST /api/payments`. Le lien provider réel peut être repris depuis l’historique.
- Historique séparé via `GET /v1/wallet/me/transactions` et `GET /v1/payments/me`. Les commandes actives sont suivies par relecture authentifiée de la liste; l’écran se rafraîchit quand leur statut/lien checkout change. La réussite et le solde viennent uniquement du backend, jamais de l’URL.
- Le bouton Mock n’apparaît que si l’API de Payments renvoie `mockConfirmationAvailable`; le backend le désactive en production. Aucune API de reçus/factures utilisateur n’a été trouvée et aucun faux reçu n’est affiché.
- Aucun changement au backend Wallet/Billing/Payments, Prisma, Gateway ou provider.

### PARTIAL
- La liste se limite aux 50 dernières écritures et 50 derniers paiements, sans pagination UI malgré les curseurs API.
- La page est dédiée aux packs de crédits; elle ne présente pas les souscriptions/options événement. Les remises ne sont pas fournies par le catalogue utilisé ici.

### NOT TESTED
- Paiement/webhook/provider réel, crédit après confirmation, reçus, OIDC/Gateway/DB runtime et QA visuelle authentifiée aux viewports 375/768/desktop.
- Le serveur Next dev local a compilé `/account/wallet` et `/api/payments/[[...path]]`; la page Wallet redirige vers OIDC (307) et l’API exige une session (401). QA visuelle authentifiée non faite.

### BLOCKED
- La validation du paiement bout en bout requiert Keycloak, Gateway, Billing, Payments, Wallet et un provider/runtime configuré. Dans le sandbox strict seul, `spawn EPERM` bloque le démarrage Next; après autorisation locale, les routes ont compilé.

### VALIDATION
- Typecheck Web réussi; ESLint ciblé page/actions Wallet réussi sans avertissements.
- Tests Web existants: 27/27 réussis exécutés individuellement; runner `node --test` bloqué dans ce sandbox avant tests par `spawn EPERM`.
- Routes Next dev compilées après autorisation du processus local. L’avertissement Autoprefixer sur `align-items:end` a été corrigé en `flex-end`.
- `git diff --check` réussi; avertissements Git de normalisation LF/CRLF seulement.

## Intégration Figma Make — Espace Agence (4 octobre 2026)

### DONE
- `/agencies` harmonisé avec shell `AppNavbar`/`events/journey.css`, palette plum/or/crème, cartes responsive, focus visible, préparation dark mode, reduced-motion et états de chargement/erreur/vide.
- Tableau de bord réel: compteurs clients/événements du workspace, membres réellement chargés, état/plan d’abonnement et quota. Les crédits disponibles ne sont affichés que si le plan retourné est `ACTIVE`; les montants restent les prix d’abonnement, séparés des crédits.
- Clients: filtre nom/e-mail/téléphone, sélection/détail des informations réellement retournées et création par `POST /v1/agencies/:id/clients`. Les rôles pouvant créer un client reflètent le service. Pas de bouton d’édition absent de l’API.
- Événements: formulaire de création lié à un client via `POST /v1/agencies/:id/events`, puis lien vers le même `/events/:eventId` front-office; les cérémonies/invités/placement/designs restent les fonctionnalités Events partagées.
- Équipe: rôles et statuts réels, identifiants `subject` cachés dans la liste; association d’un compte existant, changement de rôle, suspension/réactivation/retrait selon rôle. Le proxy Web accepte désormais le `PATCH` membres déjà fourni par Events.
- Abonnement: catalogues réels `GET /v1/pricing?segment=AGENCY`, récapitulatif dynamique puis `POST /v1/agencies/:id/subscriptions`, qui conserve le checkout Billing/Payments côté serveur. L’interface n’active jamais un plan depuis le retour navigateur.
- Navigation: liens secondaires d’agence dans la sidebar desktop; barre mobile d’agence avec cinq destinations (Accueil, Clients, Événements, Créer, Compte).
- Les tests ciblent la règle de crédits actifs et l’association client-événement lorsqu’elle est renvoyée. Aucun chiffre de reporting/finance n’est inventé.

### PARTIAL
- L’endpoint agence liste les clients mais ne fournit ni mise à jour de profil ni fiche individuelle dédiée; le détail est donc une sélection dans la page unique.
- Le contrôleur agence demande la liste d’événements puis la remplace par des détails qui omettent `agencyClientEvents`. La relation client-événement n’est donc pas disponible durablement à la relecture; l’interface n’invente pas ces associations et conserve uniquement le lien sûr du dernier événement créé en session.
- L’équipe renvoie un subject Keycloak sans nom/e-mail, et accepte l’ajout d’un compte déjà existant, pas l’envoi/renvoi d’invitation. L’UI cache les subjects affichés et explicite le mécanisme.
- Aucun endpoint de paramètres agence, historique facture/paiement, activité détaillée ou reporting n’a été trouvé; ces blocs Figma sont omis. Le quota disponible est basé uniquement sur l’abonnement actif et usage réellement renvoyés.

### NOT TESTED
- Isolation inter-agence réelle, permissions contre une base locale, mutations clients/membres/événements, paiement/provider et activation d’abonnement en runtime.
- QA visuelle authentifiée à 375/768/desktop; aucun compte ou jeu de données de démonstration n’a été créé.

### BLOCKED
- Le parcours runtime authentifié requiert Keycloak, Gateway, Events, Billing et Payments actifs avec données contrôlées. La route rend actuellement 307 OIDC sans session; le proxy membre PATCH retourne 401 avant authentification.

### VALIDATION
- Typecheck Web réussi; ESLint ciblé fichiers Agence/AppNavbar/proxy: réussi sans avertissements.
- Tests Web: 29/29 réussis en exécution séquentielle directe, incluant 5 tests période/quota/association agence. Le runner parallèle `node --test` reste limité par `spawn EPERM` en sandbox.
- Next dev compile `/agencies` et `api/agencies/[[...path]]`; réponses sans session: 307 OIDC et 401 API. Avertissement CSS `align-items:end` corrigé en `flex-end`.
- `git diff --check` réussi; seuls avertissements Git LF/CRLF.

## Intégration Figma Make — Espace Partenaire — 4 octobre 2026

### DONE
- `/partners` est harmonisée avec le shell et les tokens visuels partagés (plum/or/crème), sidebar desktop, navigation mobile de cinq entrées au maximum, cartes et tableaux adaptatifs, focus visible et reduced-motion.
- L’écran utilise le tableau de bord réel `GET /v1/partners/me` via le BFF `/api/partners`: code/statut partenaire, clients attribués, ventes confirmées, agrégats et historique du ledger, demandes de règlement. Aucun solde de portefeuille, événement, mission, profil détaillé ou statistique dérivée n’est inventé.
- Le lien d’attribution est formé depuis `PUBLIC_WEB_URL` ou `WEB_ORIGIN`; si l’origine est invalide, le lien est omis et l’état l’explique. La copie ne déclenche pas le flux referral et évite ainsi un auto-parrainage par clic.
- Demande de règlement exposée uniquement si le ledger retourne une commission payable; seul `POST /v1/partners/me/payouts` est utilisé. L’écran décrit une demande en attente d’administration, pas un paiement effectué; l’état PAID provient exclusivement de l’API.
- Contrôle de contrat: `PartnersService.dashboard` recherche le partenaire par `ownerSubject` issu de l’identité authentifiée et filtre attributions/ledger/payouts par son `partnerId`. Le BFF exige une session, contrôle Origin pour POST, passe le bearer OIDC au Gateway et applique une liste de méthodes/chemins autorisés. Aucun accès aux données invités ni route admin n’est ajouté.

### PARTIAL
- Le modèle/API exposé représente ici un partenaire commercial d’attribution. Le backend ne fournit pas de catégories imprimeur/prestataire ni de missions, commandes opérationnelles assignées, événements liés, statut d’exécution, instructions, échéances, profil modifiable ou support partenaire; ces écrans Figma sont omis.
- Les règlements sont des demandes de payout et un historique fournis par l’API; aucune méthode de paiement ou confirmation de règlement n’est créée dans cette interface.
- Les totaux et l’historique sont ceux retournés par le dashboard backend; celui-ci ne pagine pas le ledger. Aucune pagination frontend ni limite de récence supposée.
- Le dark mode dispose des sélecteurs locaux préparatoires; aucun contrôleur de thème global n’est ajouté.

### NOT TESTED
- Aucune QA visuelle authentifiée navigateur aux viewports 375/768/desktop; aucun compte OIDC partenaire ni dataset runtime créé.
- Aucune mutation de demande de règlement ni isolation inter-partenaire n’a été validée contre Gateway/Payments/PostgreSQL en runtime.

### BLOCKED
- Vérifier réellement l’isolation, le payout et le rendu authentifié nécessite Keycloak, Gateway et Payments accessibles avec deux comptes partenaires de test contrôlés. La sécurité backend n’est pas remplacée par les contrôles du BFF.

# Audit final Figma Make — cohérence globale front-office (4 octobre 2026)

L’inventaire comporte **32 parcours/écrans fonctionnels** dans le mapping ci-dessus, répartis dans 26 fichiers React sous `src/screens` dans l’export. Le statut ci-dessous est le statut de l’intégration UI InvitaFlow, pas une affirmation de validation métier runtime.

| Écran Figma | État final | Route InvitaFlow / constat |
| --- | --- | --- |
| Landing | INTÉGRÉ | `/`; landing publique, CTA Keycloak réel. |
| Auth | REMPLACÉ / PARTIEL | `/api/auth/login`, callback OIDC et thème Keycloak; pas d’écran d’auth Figma qui contournerait OIDC. |
| Onboarding | VOLONTAIREMENT OMIS | Pas de parcours onboarding API-backed; `/account` sert aux réglages existants. |
| Dashboard | INTÉGRÉ | `/dashboard`; uniquement identité et événements réels. |
| Events | INTÉGRÉ | `/events`; vraie liste et états API. |
| CreateEvent | INTÉGRÉ | formulaire progressif `/events#create-event`; les champs non persistés sont omis. |
| EventDetail | INTÉGRÉ | `/events/[eventId]`; workspace existant. |
| Ceremonies | INTÉGRÉ | programme existant via `/events?event=<id>`. |
| Guests | INTÉGRÉ | `/events/[eventId]/guests`; données, import et états réels. |
| GuestProfile | REMPLACÉ / PARTIEL | détail et édition dans le workspace Invités; pas de route autonome correspondante. |
| Tables | INTÉGRÉ | `/events/[eventId]/seating`; opérations du backend conservées. |
| Templates | PARTIEL | `/events/[eventId]/designs`; pas de prix ni niveaux Free/Premium absents du contrat. |
| Editor | INTÉGRÉ | `/events/[eventId]/designs`; seuls les outils persistables sont proposés. |
| Preview | PARTIEL | Designs/Invitations; aperçu réel avant génération, mais pas de rendu PDF complet de catalogue. |
| PublicInvitation | INTÉGRÉ | `/invite/[token]`; RSVP/token du service. |
| CheckIn | INTÉGRÉ | `/events/[eventId]/check-in`; contrôle backend et scan existant. |
| Stats | VOLONTAIREMENT OMIS | Pas d’analytics événement propre au client; `/admin/analytics` n’est pas substitué. |
| Wallet | INTÉGRÉ | `/account/wallet`; solde uniquement en crédits. |
| Pricing | REMPLACÉ | `/account/wallet`, `/agencies`; catalogues Billing réels. |
| Payment | INTÉGRÉ | checkout et états paiement existants; aucun succès navigateur fictif. |
| Notifications | INTÉGRÉ | `/account/notifications`; inbox réelle. |
| Profile | INTÉGRÉ | `/account`; champs supportés par Profile. |
| Security | REMPLACÉ / PARTIEL | Identité et session OIDC/Keycloak; pas de réglages de sécurité non exposés. |
| Preferences | PARTIEL | `/account`; réglages disponibles seulement, aucun écran de préférence fictif. |
| Agency | PARTIEL | `/agencies`; fonctions workspace existantes, éléments reporting manquants omis. |
| Agency Clients | INTÉGRÉ | `/agencies`; listes et création selon contrat. |
| Agency Team | INTÉGRÉ | `/agencies`; membres/rôles supportés, actions filtrées par permissions. |
| Agency Billing | INTÉGRÉ | `/agencies`, `/account/wallet`; plans dynamiques et checkout existant. |
| Partners | PARTIEL | `/partners`; partenaire commercial/commissions/payout uniquement; aucune mission d’événement. |
| Support | PARTIEL | `/contact`, `/account/report`; documents/contact parfois en brouillon, signalement existant. |
| Legal | PARTIEL | `/legal`, `/terms`, `/privacy`, `/cookies`, `/sales-terms`, `/refund-policy`; documents volontairement non publiés en attente de validation légale. |
| Error | INTÉGRÉ | `not-found.tsx` et états d’indisponibilité spécifiques aux services. |

## Design System et responsive

- Tokens globaux plum/violet profond, or chaud, crème, encre, surfaces et focus ajoutés dans `globals.css`; typographies DM Sans / Playfair Display et navigation AppNavbar existantes conservées.
- Un `ThemeProvider` partagé respecte `prefers-color-scheme` au premier choix, conserve le choix localement, synchronise les onglets et expose `ThemeToggle` clavier dans le shell, la landing, les pages légales et la page invitation publique. Le shell mobile garde cinq destinations au plus; la sidebar desktop est masquée sous 820 px.
- Dark mode global ajoute couleurs de base et formulaires, avec overrides ciblés pour landing, RSVP, compte, notifications, Dashboard et pages légales; les règles déjà préparées des parcours Events, Wallet, Agence et Partenaire sont activées par le même attribut/classe.
- Responsive réellement mesuré dans le navigateur sur la landing et la page légale à 320, 375, 430, 768, 1024 et 1440 px: aucune largeur de document supérieure au viewport. L’état d’indisponibilité invitation a également été mesuré; son contenu métier ne peut être chargé sans Invitations runtime.
- Reduced-motion, contrôles natifs/labels et styles de focus existants sont conservés; le ThemeToggle possède un nom accessible et un état `aria-pressed`.

## Cohérence restant à contrôler

Les tokens et la navigation sont partagés, mais de nombreuses feuilles de route gardent des styles CSS et boutons propres. Il n’y a pas encore de consolidation complète de chaque carte/champ/badge en primitives communes: un remplacement global risquerait de modifier les workspaces métier. La QA clavier/contraste et le rendu dark des routes privées complexes ne peuvent pas être certifiés sans session OIDC; seuls la landing et les pages publiques ont été vus réellement dans ce passage. Les 26 fichiers de composants Figma ne sont pas copiés; aucune dépendance Figma ni aucun asset distant de démonstration n’est utilisé. Les fichiers backup présents ne sont pas supprimés faute de preuve qu’ils sont jetables.

## Statut final

### DONE
- Mapping des 32 parcours tenu à jour; routes absentes documentées au lieu d’être simulées.
- Bascule globale clair/sombre ajoutée, contrôlable au clavier et persistante; cohérence dark corrigée sur les pages publiques après contrôle visuel.
- Responsive navigateur mesuré sur six largeurs pour Landing et Legal sans débordement; page RSVP vérifiée dans son état sans backend.
- Aucun service, API métier, Gateway, Keycloak/OIDC, dépendance ou donnée de production modifié.

### PARTIAL
- Harmonisation formelle des primitives boutons/champs/cartes/badges; des styles locaux historiques demeurent.
- Responsive et dark visuel de toutes les routes privées, QA clavier exhaustive, contraste automatisé et contrôles avec lecteur d’écran.
- Onboarding, statistiques événement, certaines préférences, missions partenaire, support/tickets et détails profil invité restent absents du backend ou volontairement omis.

### NOT TESTED
- Parcours runtime OIDC, Events, Invitations, QR/check-in, paiement, Agence/Partenaire et autres mutations contre les vrais services.
- Tests Web UI dédiés au ThemeProvider; la suite automatisée actuelle ne teste pas le rendu/comportement visuel React.
- Audit visuel des 32 pages par captures; seules Landing, Legal et l’état de chargement RSVP ont été rendus dans un navigateur pendant cette passe.

### BLOCKED
- Inspection/authentification complète des espaces privés nécessite Keycloak/Gateway et jeux de données de test contrôlés. Aucun bypass/session factice n’a été utilisé.
- Une validation complète du dark mode pour chaque variante d’écran exige que ces routes soient ouvertes avec des données et permissions réelles.

### VALIDATION DE CETTE PASSE
- Typecheck Web: réussi. ESLint ciblé: réussi. ESLint global Web: réussi sans erreur ni avertissement.
- Tests Web existants: 29/29 réussis exécutés fichier par fichier; le runner groupé sandboxé reste bloqué avant l’exécution par `spawn EPERM`.
- Next production build: réussi hors sandbox (`Compiled successfully`, routes générées); la propriété `metadataBase` utilise l’origine publique configurée, avec localhost comme fallback de développement.
- Next dev: `/`, `/legal`, `/invite/[token]`, `/dashboard`, `/events`, Designs, Invitations, Wallet, `/agencies` et `/partners` compilent; routes privées demandent OIDC (307). Landing et Legal renvoient 200; invitation de contrôle renvoie l’état de chargement et l’API publique 404 pour ce token synthétique. Aucun RSVP/paiement n’a été soumis.
- Responsive: aucun débordement sur Landing/Legal aux six largeurs listées; RSVP testé sans données à ces largeurs. `git diff --check` passe avec les seuls avertissements Git de normalisation LF/CRLF.

**Décision historique — supersédée par l’addendum Final cleanup ci-dessous.** La QA runtime authentifiée est suivie séparément du statut de complétude UI.

## Final cleanup — décision UI et matrice des 32 parcours (4 octobre 2026)

Cet addendum fait autorité sur les anciens statuts contradictoires ci-dessus. `DONE` décrit l’interface réellement présente pour les capacités backend disponibles; les écrans Figma sans contrat ne sont pas simulés. `NOT TESTED` décrit la QA en runtime authentifié et ne signifie pas que l’UI manque.

### Consolidation et corrections finales

- Le shell de navigation (`AppNavbar`), logo partagé (`BrandLogo`) et contrôle/thème (`ThemeProvider`, `ThemeToggle`) sont les implémentations communes réutilisées. La recherche n’a pas révélé de deuxième implémentation ayant le même rôle et le même contrat justifiant une abstraction plus large; les états et formulaires propres aux workspaces gardent leur comportement.
- Aucun import ni dépendance runtime Figma Make n’est référencé dans `apps/web`. Aucun paquet n’a été supprimé faute de preuve d’inutilisation.
- Correction dark mode sur le workspace Événements/Invités: surfaces de formulaire, import, cérémonies, programme, textes secondaires et badges lisibles; aucun changement fonctionnel.
- Desktop garde la sidebar; la navigation mobile partagée limite les actions principales à cinq et masque la sidebar desktop sous 820 px. `prefers-reduced-motion`, focus visible et libellés accessibles demeurent activés.
- Les contrôles responsive réels déjà réalisés à 320/375/430/768/1024/1440 px couvrent Landing, Legal et l’état d’indisponibilité d’invitation. La compilation production couvre toutes les routes, mais ne remplace pas une QA visuelle privée authentifiée.

### Matrice de complétude

| Parcours (32) | UI | Runtime QA |
| --- | --- | --- |
| Landing | DONE | DONE — rendu public vérifié |
| Auth | DONE — entrée OIDC existante, sans faux formulaire | NOT TESTED — Keycloak/session |
| Onboarding | OMITTED — aucun contrat/parcours backend | N/A |
| Dashboard | DONE | NOT TESTED — session/données requises |
| Events | DONE | NOT TESTED — session/services requis |
| CreateEvent | DONE — champs persistables | NOT TESTED — mutation réelle |
| EventDetail | DONE | NOT TESTED — session/données requises |
| Ceremonies | DONE — éditeur existant réutilisé | NOT TESTED — mutation réelle |
| Guests | DONE | NOT TESTED — session/services requis |
| GuestProfile | DONE — édition intégrée au workspace Invités | NOT TESTED — mutation réelle |
| Tables / placement | DONE | NOT TESTED — session/services requis |
| Templates | DONE — catalogue et filtres disponibles; gratuit/premium omis faute de contrat | NOT TESTED — données Designs runtime |
| Editor | DONE — outils persistables existants | NOT TESTED — session/services requis |
| Preview | DONE — preview pré-génération réelle; PDF catalogue complet omis | NOT TESTED — médias/designs runtime |
| PublicInvitation | DONE | NOT TESTED — token et service valides requis |
| CheckIn | DONE | NOT TESTED — session/scanner/runtime requis |
| Stats | OMITTED — analytics événement client non fourni | N/A |
| Wallet | DONE — crédits et données Billing réelles | NOT TESTED — session/services requis |
| Pricing | DONE — plans/valeurs dynamiques via Billing | NOT TESTED — catalogue runtime |
| Payment | DONE — checkout/états existants, aucun succès simulé | NOT TESTED — provider/webhook requis |
| Notifications | DONE | NOT TESTED — session/service requis |
| Profile | DONE — champs Profile pris en charge | NOT TESTED — session/mutation requise |
| Security | DONE — identité/session OIDC existantes | NOT TESTED — Keycloak requis |
| Preferences | DONE — préférences actuellement exposées | NOT TESTED — session/runtime requis |
| Agency | DONE — fonctions retournées par les APIs | NOT TESTED — permissions/données runtime |
| Agency Clients | DONE — actions prises en charge | NOT TESTED — mutation réelle |
| Agency Team | DONE — rôles/actions pris en charge | NOT TESTED — mutation/isolation réelle |
| Agency Billing | DONE — abonnements dynamiques existants | NOT TESTED — Billing/Payments runtime |
| Partners | DONE — attribution/ledger/payout exposés | NOT TESTED — isolation/payout runtime |
| Support | DONE — contact et signalement existants; tickets étendus omis faute de contrat | NOT TESTED — envoi réel |
| Legal | DONE — pages et états documentaires présents | DONE — rendu public vérifié; approbation éditoriale distincte |
| Error | DONE — 404 et erreurs spécifiques aux services | NOT TESTED — variantes service en runtime |

### Validation de cette passe

- Typecheck Web: réussi. ESLint Web global: réussi.
- Tests Web: 29/29 réussis en lançant séquentiellement les huit fichiers. Le runner standard sandboxé échoue avant tests (`spawn EPERM`); exécution autorisée avec workers Node.
- Build Next production: réussi, routes générées.
- Responsive: mesures navigateur antérieures sans overflow pour Landing, Legal et état d’indisponibilité invitation aux six largeurs indiquées. Les pages privées compilent mais leur rendu avec session réelle reste non testé.
- Recherche des références Figma dans `apps/web`: aucune importation/dépendance runtime trouvée.
- `git diff --check`: à confirmer après cet addendum.

**Figma Make integration complete at UI level: YES.** Aucun travail frontend restant n’a été identifié dans le périmètre livré; capacités sans API demeurent explicitement omises et ne sont pas des écrans incomplets.

**Runtime authenticated QA complete: NO.** Les parcours privés attendent une session Keycloak et des services/données contrôlés.
