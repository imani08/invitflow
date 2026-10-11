# Parcours événement et IA — état de livraison du 11 octobre 2026

## Clôture de passe ciblée — brouillons, Wallet et finalisation

État : code raccordé, contrôles ciblés réussis ; parcours réel **non validé**. Les sections historiques ci-dessous décrivent les livraisons précédentes et ne remplacent pas cet état.

- Storyboard : six étapes conservées, personnalisation facultative, aucune refonte.
- Brouillons : stockage serveur chiffré par propriétaire, brouillons incomplets distincts des validations métier, révision atomique et file de sauvegarde ; sauvegarde attendue avant navigation. Dernière version du design explicitement enregistrée avant les invités. Un fichier d’import non analysé, y compris déposé, bloque le départ plutôt que d’être perdu.
- Crédits : solde disponible serveur, chargement/erreur sans faux zéro ; achat via Wallet et destination interne contrôlée. Aucun lancement automatique d’émission au retour.
- Finalisation : fichiers relus avant règlement, nombre de succès figé, règlement idempotent, publication après confirmation financière. Succès partiels facturés seuls ; reprise technique des échecs. Une réponse financière perdue laisse FINALIZING et reprend le même règlement, sans remboursement spéculatif. Archives partielles/annulées financées incluses dans l’inventaire ; archives FINALIZING protégées dans l’inventaire et non téléchargeables. Merci exige aussi la confirmation financière.

| Point d’entrée | Autorisation/calcul | Réservation, doublons | Accès fichiers | Preuve disponible / limite |
| --- | --- | --- | --- | --- |
| Émission individuelle, sélection ou lot | Événement/design/invités contrôlés serveur ; déduplication | Empreinte événement/design/version/sélection, clé stable ; réservation Wallet/quota | Seulement résultats financés | Tests service simulés ; API et concurrence PostgreSQL réelles non validées |
| Worker et reprise technique | Items du lot autorisé ; seuls succès facturés | Baux, statut FINALIZING, compteur figé, règlement idempotent | Publication après règlement | Tests succès partiel, annulation, fichier absent, réponse financière perdue ; redémarrage réel non validé |
| PDF, ZIP, reconstruction | Propriétaire et lot financé | Retéléchargement/reconstruction sans nouveau débit | Marqueur financier obligatoire | Tests doubles Prisma/stockage ; vrais PDF/ZIP/QR non validés |
| RSVP/QR et assets | Version publiée financée ; routes publiques existantes conservées | Pas de débit au téléchargement | Contrôle serveur ; buckets non publics | Inspection statique ; liens signés et QR réels non validés |
| Brouillons et aller-retour Wallet | Session, origine, accès événement, chemin interne autorisé | Comparaison atomique de révision ; sauvegarde avant départ | Sans objet | Handler HTTP de production avec dépendances simulées ; Redis et interactions navigateur réelles non validés |
| Confirmation d’achat | Événement paiement serveur validé ; retour navigateur sans valeur probante | Notification idempotente | Sans génération automatique | Tests routage paiement et double notification simulés ; achat réussi/annulé/échoué/en attente réel non validé |

### Vérifications de clôture exécutées

- Typecheck et lint web / Invitations : réussis. Typecheck Gateway, Events et Wallet : réussis.
- 34 tests ciblés distincts : 6 brouillons, 2 politique émission, 2 confirmation, 12 service/finalisation Invitations, 6 quota agence, 6 Wallet/routage paiement : réussis. Les 5 tests financiers ont été relancés après la correction d’inventaire.
- Les tests utilisent des doubles en mémoire et un handler HTTP réel avec dépendances simulées. **Aucune vraie base de données ni API de paiement utilisée.**
- Windows : spawn EPERM contourné avec --test-isolation=none ; tests tsx/esbuild exécutés avec autorisation hors sandbox.
- Aucun Docker, déploiement, migration, appel GPT/FLUX payant, commit ou push exécuté pendant cette clôture.

### Validations reportées et mise en service

Non validés : parcours authentifié desktop/mobile, sauvegarde/reconnexion Redis réelle, accès inter-utilisateurs via stack réelle, concurrence/verrous PostgreSQL, finalisation Media/MinIO, crash/reprise workers, achats et notifications réels, PDF/ZIP et QR, GPT/FLUX réels.

Prérequis : appliquer au déploiement contrôlé la migration Invitations 202610110002_financial_finalization (non exécutée ici), puis reconstruire uniquement web, gateway, invitations, events et wallet modifiés. Commandes Docker ultérieures : docker compose build web gateway invitations events wallet ; docker compose up -d --no-deps web gateway invitations events wallet. Vérifier la procédure de migration existante avant démarrage. Ne pas reconstruire toute la stack.

### Fichiers ajustés pendant cette clôture

apps/web/package.json ; apps/web/src/app/events/[eventId]/designs/workspace.tsx ; apps/web/src/app/events/[eventId]/guests/workspace.tsx ; apps/web/src/components/journey-drafts.tsx ; apps/web/src/lib/invitation-confirmation.mjs ; apps/web/src/lib/invitation-confirmation.test.mjs ; apps/web/src/lib/journey-drafts.test.mjs ; services/invitations/src/invitation.service.ts ; services/invitations/src/invitation.service.spec.ts ; services/invitations/src/emission-policy.spec.mjs ; services/invitations/src/financial-finalization.spec.ts ; docs/event-journey-ai.md. Le fichier tsconfig.tsbuildinfo a également été actualisé par TypeScript.

---


## Historique — audit crédits et reprise avant cette clôture

Règle commerciale confirmée par le propriétaire : **chaque nouvelle émission coûte un crédit**, notamment après modification du design ou des informations du même invité. Le retéléchargement d'un PDF déjà financé et la reconstruction de son ZIP ne doivent pas débiter de crédit. Une réservation n'est pas encore une consommation définitive.

Correction supplémentaire : le téléchargement individuel exige maintenant un lot `COMPLETED`, tout comme le ZIP. Le worker ne persiste cet état qu'après les confirmations de règlement Wallet/quota agence. Auparavant, un item `GENERATED` suffisait et pouvait exposer le PDF pendant la réservation, avant le règlement. Les lots non terminés, échoués, annulés et `PARTIAL` restent bloqués ; le support financier complet des succès partiels reste à implémenter avant de les ouvrir.

Deux tests unitaires supplémentaires couvrent le refus avant finalisation (six états) et deux téléchargements successifs d'un lot terminé, sans appel Wallet. Ils utilisent des doubles Prisma/stockage, **pas une API réelle ni PostgreSQL/MinIO**.

| Domaine | Inspection actuelle | Travail restant |
| --- | --- | --- |
| Storyboard/navigation | Six étapes et sélection sans éditeur conservées ; précédents essais Chromium avec API simulée documentés ci-dessous. | Parcours authentifié réel non validé. |
| Réservation Wallet | Mise à jour conditionnelle des soldes, transaction et verrou wallet ; règlement idempotent et tombstone de libération avant réservation présents. | Concurrence PostgreSQL réelle, livraison répétée des événements paiement et reprise réseau à tester de bout en bout. |
| Génération | Une nouvelle émission crée une version et réserve selon les invités autorisés ; règlement avant état `COMPLETED`. | Requêtes rejouées : omission de `guestIds` insuffisamment distinguée d'un ancien sous-ensemble ; course de création avec la même clé ; arrêt en `RESERVING` ; bail worker périmé ; annulation/finalisation simultanées. |
| Succès partiel | L'existant annule les PDF réussis et rembourse le lot si un item échoue. | Conserver/facturer les seuls succès et reprendre les échecs sans refacturer les succès ; non implémenté. |
| Fichiers finaux | PDF individuels désormais bloqués avant finalisation, ZIP et reconstruction déjà réservés aux lots terminés ; aucun contrôle du solde courant lors du retéléchargement. | Audit complet QR/publicInvitation et signature S3 du stockage Invitations ; rendu/fichiers finaux non validés. |
| Persistance/reprise | Enregistrements explicites et sélection de design côté services existants ; avertissement de sortie présent. | **Brouillons incomplets non persistés automatiquement**. Persistance serveur par propriétaire, révisions concurrentes, indication de sauvegarde, erreurs/retry et attente avant navigation restent à implémenter. L'avertissement ne remplace pas cette exigence. |

Validation de cette correction : tests Invitations ciblés **7/7**, compilation TypeScript Invitations et lint Invitations réussis. Le premier lancement des tests a rencontré `spawn EPERM` ; relance autorisée hors sandbox avec `--test-isolation=none`, sans Docker. Aucune migration ni clé modifiée. Ne pas interpréter cette correction comme un audit crédits achevé ou une reprise des brouillons livrée.

## Vérification explicite du storyboard reçu — six écrans

Le dessin joint à la dernière demande a été examiné : événement (création/consultation) → cérémonies/programme (création/consultation) → propositions/choix/personnalisation facultative → invités/import → génération/téléchargement ZIP → Merci. La progression principale correspond désormais à ces **six** écrans. Placement et pointage restent accessibles comme outils complémentaires, sans ajouter d'étape imposée.

**Portée des essais :** les composants React de production ont été montés dans Chromium avec des réponses API de test et un adaptateur de navigation Next. Les routes serveur/session/proxies sont inspectées et compilées, mais ne sont pas exécutées contre la stack. Aucune capture ne constitue une preuve d'authentification, de paiement ou de fichier généré réel.

| Écran | Route et composant | Implémenté / flèche suivante | Réellement essayé sans Docker | Reste à vérifier en runtime |
| --- | --- | --- | --- | --- |
| 1. Événements | `/events` et `/events/[eventId]` ; `events/page.tsx`, `events/workspace.tsx` (`EventsWorkspace`), `[eventId]/page.tsx` | Création, liste et consultation ; « Créer et continuer » ouvre la vue de l'événement, puis « Configurer les cérémonies ». Aide et indication étape 1. | Rendu desktop/mobile du formulaire réel, saisie du nom, POST intercepté et destination `/events/{id}` vérifiée dans l'adaptateur. La vue serveur de détail est inspectée, pas essayée avec une session. | Persistance réelle, consultation authentifiée et transition Next vers le détail. |
| 2. Cérémonies / programme | `/events?event=[eventId]#ceremony-[eventId]` ; `EventsWorkspace`, `CeremonyProgramEditor` | CRUD cérémonies et étapes du programme existants ; progression étape 2 et nouvelle action « Découvrir mes propositions » vers les designs. Retour à l'événement. | Composant déroulé rendu desktop/mobile ; étape 2 et href vers `/events/{id}/designs` vérifiés. Tests Web existants des dates/plages conservés et relancés. | Créations/modifications/suppressions réelles et consultation après rechargement ; aucun POST cérémonie réel essayé. |
| 3. Propositions de designs | `/events/[eventId]/designs` ; `DesignsWorkspace` | Choisir, accepter puis « Utiliser ce design et ajouter mes invités » ; sauvegarde/validation de version avant continuation. Personnalisation et outils avancés facultatifs. Retour vers cérémonies. | Desktop/mobile : sélection sans éditeur, action visible, destination invités, modification, échec de sauvegarde puis nouvelle tentative, retour annulé conservant le brouillon ; zéro exception. | Session, persistance/contrôle de version réels, Media et appels GPT/FLUX. |
| 4. Invités | `/events/[eventId]/guests` ; `GuestsPage`, `GuestsWorkspace` | Import guidé analyse → colonnes/cérémonies → aperçu → confirmation ; gestion manuelle. Étape 4 et « Vérifier mes invitations ». La progression relit désormais les effectifs après actualisation/import, au lieu de rester périmée. | Rendu desktop/mobile de la gestion/import ; passage de zéro à un invité simulé et actualisation de l'action suivante ; annulation du retour après saisie d'un brouillon vérifiée. | Fichier Excel/CSV réellement importé, rapport d'erreurs, persistance des invités/permissions ; l'import réel n'a pas été exécuté. |
| 5. Génération / ZIP | `/events/[eventId]/invitations` ; `InvitationsPage`, `InvitationsWorkspace` | Aperçu, choix des invités, confirmation des crédits, réservation/idempotence et contrôles serveur existants conservés. Statuts/lots/ZIP. Nouveau lien « Terminer → Merci » associé au lot ; également après demande de téléchargement. Retour aux invités. | Rendu desktop/mobile avec lot terminé et wallet de test ; présence du bouton de génération, du téléchargement protégé et du lien Merci vérifiée. Pas de génération ni de téléchargement exécuté. | Paiement/quota/réservation/règlement réels, rendu PDF, ZIP complet, expiration, vraie réponse du téléchargement. |
| 6. Merci | `/events/[eventId]/invitations/merci?batch=[batchId]` ; `ThankYouPage`, `InvitationConfirmation` | Nouvelle page protégée par session et lecture propriétaire de l'événement ; statut du lot lu via API protégée. ZIP uniquement si terminé/non expiré ; accès événement et lots ; lecture seule, aucun débit/génération. Sans batch, recherche d'un lot disponible. | Desktop/mobile : terminé → ZIP, en cours → aucun ZIP, expiré → aucun ZIP, erreur API → message, nouvelle tentative → prêt. Requêtes GET uniquement. | Route serveur authentifiée réelle, autorisations inter-événements, ZIP téléchargé et ouverture du fichier. |

### Retours, aide et conservation

- Chaque écran principal indique son étape et une aide courte ; la vue de programme intègre maintenant la progression qu'elle n'avait pas. L'étape active est centrée dans la barre défilante mobile.
- La première capture du programme mobile a révélé un débordement à 731 px : la grille conservait la largeur intrinsèque de la barre de progression. Des contraintes `min-width: 0` et une colonne `minmax(0,1fr)` corrigent la cause ; la nouvelle capture mesure 375 px. Le harnais vérifie maintenant l'absence de débordement horizontal sur les quatre autres écrans aussi.
- « Étape précédente » est explicite dans la navigation partagée. Les données enregistrées sont relues depuis les services, jamais fabriquées depuis la progression.
- Les modifications de design non enregistrées et les formulaires événement/cérémonie/invité déclenchent un avertissement avant de suivre un lien quittant l'écran ou de fermer la page. Annuler le retour conserve les valeurs ; aucune donnée d'invité n'est stockée dans localStorage/sessionStorage. La protection de formulaire est conservatrice : un formulaire soumis mais non réinitialisé peut encore demander confirmation.
- Cela **n'est pas une sauvegarde automatique**. Le retour navigateur SPA, un crash du navigateur et la restauration de tous les brouillons après fermeture ne sont pas validés. Ne pas promettre une conservation durable de données non enregistrées.
- Le lien Merci ne prétend jamais que le fichier a été enregistré sur l'appareil. Après un clic, le texte indique seulement « Téléchargement demandé au navigateur ».

### Captures du storyboard

Les fichiers `storyboard-events-{desktop,mobile}.png`, `storyboard-ceremonies-{desktop,mobile}.png`, `storyboard-guests-{desktop,mobile}.png`, `storyboard-invitations-{desktop,mobile}.png`, `workspace-{desktop,mobile}-selected.png` et `confirmation-{desktop,mobile}.png` se trouvent dans `docs/design-references/reconstructed/`. Ils montrent les composants avec **données de test**, pas la stack authentifiée. Les résultats détaillés sont dans `workspace-ui-report.json` (`authenticatedJourneyValidated: false`, `realZipDownloaded: false`, `realImportOrGeneration: false`).

### Contrôles de cette passe storyboard

- Typecheck et lint Web : réussis.
- Tests Web élargis : **74 réussis**, dont les tests du parcours à six étapes, du rafraîchissement de progression et de la confirmation.
- Chromium : six cas desktop/mobile réussis (Designs, Merci et autres écrans regroupés), aucune exception client. Tests de fournisseurs externes interdits par le routage du harnais.
- Build production Web : réussi ; la route `/events/[eventId]/invitations/merci` est compilée.
- `git diff --check` : réussi.
- Docker, déploiement, commit, push, paiement et appels GPT/FLUX : non exécutés.

Fichiers modifiés dans cette passe : `apps/web/package.json`, `apps/web/src/components/event-journey.tsx`, `apps/web/src/app/events/journey.css`, `apps/web/src/app/events/workspace.tsx`, `apps/web/src/app/events/[eventId]/designs/workspace.tsx`, `apps/web/src/app/events/[eventId]/guests/workspace.tsx`, `apps/web/src/app/events/[eventId]/invitations/workspace.tsx`, `apps/web/src/lib/event-journey.mjs`, `event-journey.d.mts`, `event-journey.test.mjs`, `scripts/design/qa-workspace-entry.tsx`, `scripts/design/verify-workspace-ui.mjs`, ce document et les captures/rapport du harnais. Créés : `apps/web/src/components/journey-navigation-safety.tsx`, `apps/web/src/app/events/[eventId]/invitations/merci/page.tsx`, `confirmation.tsx`, `apps/web/src/lib/invitation-confirmation.mjs`, `invitation-confirmation.d.mts`, `invitation-confirmation.test.mjs`, les huit captures des écrans 1/2/4/5 et les deux captures Merci.

Pour appliquer **uniquement cette passe frontend**, plus tard et dans l'environnement approprié : `docker compose build web`, puis `docker compose up -d --no-deps web`. Ces commandes n'ont pas été exécutées. Les changements backend/migration de la livraison précédente ont leurs propres prérequis documentés plus bas.

## Implémenté

- Ordre guidé : événement, programme, design et textes, invités, placement facultatif, invitations.
- Depuis la liste des événements, « Reprendre ma préparation » consulte les données serveur et ouvre l'étape utile, ou les lots existants. Une erreur de lecture n'est pas assimilée à un brouillon vide.
- Design simple par défaut ; personnalisation et assistant facultatifs. La continuation sauvegarde le document puis valide et enregistre le couple design/version côté serveur, sous verrou, pour l'événement et son propriétaire.
- Correction du contrat `/validate` : attente de l'inspection asynchrone avant de retourner `problems` et `variables`. Les réponses incomplètes produisent une erreur explicite plutôt qu'un plantage `.map()` ou une fausse liste vide.
- GPT : rédaction, reformulation, raccourcissement, modifications structurées autorisées et préparation d'une instruction visuelle. Aucun code du modèle n'est exécuté. La politique des templates professionnels reste appliquée.
- FLUX : demande explicite de nouveau décor, traitement asynchrone, suivi du même identifiant fournisseur, téléchargement borné et stockage privé. L'application du décor passe par Media, sa quarantaine, ClamAV et Sharp avant d'utiliser un asset READY dans le document.
- Aperçu de la proposition assemblée avec les textes et le décor ; conservation de l'ancien document dans l'historique local. La sauvegarde crée ensuite une version serveur via le mécanisme existant.
- Génération : version relue transmise au serveur, clé d'idempotence conservée lors d'une nouvelle tentative identique, aperçu représentatif et accès aux corrections. Le programme et les tables du snapshot sont filtrés selon les cérémonies auxquelles chaque invité a accès, avant réservation des crédits.
- Dates d'affichage partagées entre composition, éditeur et snapshots de rendu, avec fuseau IANA explicite. Les anciennes données déjà formatées restent utilisables.
- Les paiements, PaymentProvider/EasyPay, crédits, QR, RSVP et contrôles d'accès existants sont conservés.

## Complément sans Docker : modèles et simplicité du parcours

Deux modèles de référence structurés sont maintenant proposés en tête du catalogue mariage/dot, indépendamment des compositions originales et des propositions IA : `reference-01-ivory` et `reference-02-gold`. Le service Designs les découvre depuis le moteur partagé, après contrôle d'accès à l'événement. Choisir un modèle crée un vrai design, sa version initiale et l'événement outbox existant ; aucun faux asset ni identifiant de template en base n'est inventé.

Le modèle 01 reprend le portrait ivoire (proportions du JPG), la table en haut à gauche, le nom calligraphié, le collage central, le cadre de texte et les deux colonnes du programme. Le modèle 02 reprend le carré doré, le bandeau invité blanc, la photo latérale, le grand cadre central et le contact inférieur. Les dates se décomposent depuis les véritables instants et le fuseau IANA. Les noms, textes, lieux, dates, tables et invités restent des données liées ; la conclusion et le contact du carré sont des variables éditables. Le JPG original n'est jamais utilisé comme fond : aucun ancien texte ne reste derrière le texte personnalisé.

Le format d'impression déclaré est A5 pour le portrait et 150 × 150 mm pour le carré, transmis au validateur et au HTML de rendu. Cette adaptation est testée statiquement ; **le PDF réel reste non validé**.

### Écarts visuels explicites

- La police originale n'est pas identifiée. **Great Vibes** est l'approximation choisie, embarquée sous SIL OFL 1.1 avec sa licence. Des tracés de glyphes latins portables évitent un chargement réseau et une exception CSP. Les caractères non couverts utilisent le repli typographique habituel. Sources : [Great Vibes](https://github.com/googlefonts/great-vibes), [fichier distribué par Google Fonts](https://github.com/google/fonts/tree/main/ofl/greatvibes).
- Palmes, fleur, papier, étiquette et contours sont redessinés en SVG : silhouettes, nuances, attaches et texture ne sont pas identiques au JPG.
- Les photos originales séparées et leur détourage ne sont pas disponibles. Les captures utilisent explicitement la photo de démonstration existante, avec des sujets différents. Le masque du portrait est géométrique, moins organique que l'aquarelle originale ; celui du carré est une approximation de silhouette et ne remplace pas un vrai détourage Media.
- Les annotations « nom de l'invité », « photo des mariés », etc. du document de référence ne sont pas imprimées. Les nuances de dress code ne sont pas devinées depuis un texte libre.
- Le programme utilise les cérémonies réellement enregistrées, sans inventer le vin d'honneur ou les adresses de la référence. Plusieurs moments d'une même journée peuvent donc être répartis autrement que dans son panneau unique. Une adaptation à trois/quatre cérémonies modifie volontairement la composition pour rester lisible.
- Une zone QR supplémentaire est réservée en haut du portrait et en bas à droite du carré. Les captures de composition ne montrent pas de faux QR.

Ces écarts empêchent de qualifier les reconstructions de copies pixel à pixel. Les modèles éditables et leur composition principale sont livrés ; la fidélité artistique exacte reste partielle.

### Preuves visuelles et interactions réellement exécutées

- [Modèle 01 — référence / reconstruction](design-references/reconstructed/reference-01-ivory-comparison.png)
- [Modèle 02 — référence / reconstruction](design-references/reconstructed/reference-02-gold-comparison.png)
- [Écran Designs desktop après sélection](design-references/reconstructed/workspace-desktop-selected.png)
- [Écran Designs mobile après sélection](design-references/reconstructed/workspace-mobile-selected.png)
- Rapports : `design-references/reconstructed/render-report.json` et `workspace-ui-report.json`.

Chromium local a rendu le SVG partagé des deux modèles. Le composant React **réel** Designs a aussi été monté avec des réponses API de test et un adaptateur de navigation Next, en 1440 × 1000 et 375 × 812. Tous les appels externes étaient bloqués. Ont été essayés : choix du modèle sans éditeur, continuation vers les invités, personnalisation facultative, masquage des outils avancés, échec de sauvegarde puis nouvelle tentative. Le bouton « Utiliser ce design et ajouter mes invités » était dans la zone visible après sélection ; aucun débordement horizontal ni exception client n'a été observé. Cela ne valide ni les API déployées, ni une session authentifiée, ni une navigation Next réelle entre pages.

La continuation est placée avant les outils ; le composeur local est replié, l'assistant éditorial apparaît seulement en personnalisation, les calques/outils avancés nécessitent une ouverture explicite. Les autres écrans (événement/cérémonies, invités, placement, invitations) ont fait l'objet d'une **inspection statique** des consignes, de la progression et des états : leurs interactions n'ont pas été exécutées dans ce complément. Les états d'erreur existants sont conservés ; aucune indisponibilité n'est remplacée par un chargement infini.

## Configuration serveur uniquement

Renseigner les clés dans la configuration locale non suivie ou le gestionnaire de secrets. Ne jamais utiliser une variable `NEXT_PUBLIC_*` pour ces clés.

| Variable | Valeur d'exemple / rôle |
| --- | --- |
| `AI_PROVIDER` | `openai` ; l'absence de clé laisse les templates et la saisie manuelle disponibles |
| `OPENAI_API_KEY` | secret serveur, vide dans `.env.example` |
| `OPENAI_TEXT_MODEL` | `gpt-5.4`, configurable |
| `AI_IMAGE_PROVIDER` | `none` par défaut ; `flux` pour activer les décors payants |
| `BFL_API_KEY` | secret serveur, vide dans `.env.example` |
| `FLUX_MODEL` | `flux-2-klein-9b` ; variante preview également reconnue |
| `FLUX_RESULT_HOSTS` | hôtes de livraison BFL explicitement autorisés ; pas de wildcard |
| `AI_MAX_REQUESTS_PER_HOUR_PER_EVENT` | quota supplémentaire par événement, 6 par défaut |

Consulter `.env.example` pour les quotas utilisateur et globaux existants. Les quotas IA sont indépendants des crédits d'invitations.

Les lignes commentées `OPENAI_API_KEY=EXAMPLE_NOT_A_REAL_OPENAI_KEY` et `BFL_API_KEY=EXAMPLE_NOT_A_REAL_BFL_KEY` sont des exemples **fictifs**, jamais des identifiants opérationnels. Les valeurs actives restent vides par défaut. Ne pas activer une fausse clé pour tester : sans clé, continuer avec le catalogue et les textes saisis manuellement. Aucun appel payant n'a été effectué dans cette passe.

Les appels GPT utilisent Responses avec sortie JSON structurée et `store: false`. Le contrat BFL utilise `x-key`, `polling_url` puis `result.sample`. Les URLs temporaires ne sont pas une référence permanente du design. Aucun token fournisseur ni URL de suivi interne n'est exposé dans les jobs publics.

Références officielles vérifiées : [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4), [FLUX.2](https://docs.bfl.ai/flux_2/flux2_text_to_image).

## Reprises et consommation

Les requêtes identiques pour une même version réutilisent le job persistant. Les checkpoints conservent la réponse GPT et l'identifiant de tâche FLUX. Une reprise réutilise ces résultats, avec trois tentatives au maximum. Si le processus s'interrompt après une soumission mais avant son accusé de réception persistant, `submission_uncertain` bloque une nouvelle soumission automatique : une vérification opérateur est nécessaire pour éviter une seconde facturation.

Les tokens retournés par GPT, le modèle, l'opération et le nombre de demandes d'image sont conservés dans les résultats privés. Ce suivi ne constitue pas une estimation monétaire ni un rapprochement avec la facture fournisseur. Aucune liste complète d'invités n'est envoyée pour le décor.

## Migration et déploiement ciblé

La migration additive `202610110001_event_design_selection` crée la sélection par événement/propriétaire, sans effacer les designs existants. Le démarrage de l'image Designs applique déjà `prisma migrate deploy`.

```powershell
docker compose build designs ai-design invitations gateway web
docker compose up -d --no-deps designs ai-design invitations gateway web
```

Ces commandes ne reconstruisent pas toute la stack. Les dépendances existantes (bases, Redis, RabbitMQ, Media, MinIO et antivirus) doivent déjà être disponibles. Media n'a pas été modifié dans cette passe.

## Vérifications de la livraison précédente (historique)

| Contrôle | Résultat |
| --- | --- |
| Typecheck Web, Gateway, Designs, AI Design et Invitations | Réussi |
| Lint des cinq workspaces | Réussi ; avertissements préexistants de configuration React/Next dans Gateway |
| Tests Web | 79 réussis |
| Tests moteur design-document | 58 réussis |
| Tests Designs | 13 réussis |
| Tests AI Design | 18 réussis, plus 3 tests de checkpoints réussis |
| Tests Invitations | 7 TypeScript et 11 JavaScript réussis |
| Tests import/listes Guests | 14 réussis |
| Tests proxy Designs/timeout Media | 4 réussis |
| Build production Web | Réussi, Next.js 15.5.26 |
| Compose avec `.env.example` | Configuration valide |

Sous Windows, `--test-isolation=none` a été utilisé. Les tests TypeScript/esbuild et le build Next ont nécessité une exécution autorisée hors sandbox à cause de `spawn EPERM`. Les tests fournisseurs interceptent les réponses HTTP ; ils ne démontrent pas un appel réel GPT/FLUX ni une facturation réelle. Le fixture PNG de FLUX teste le contrat de téléchargement, pas un scan ClamAV réel.

## Limites et validation runtime restante

- Docker Desktop n'est pas accessible dans cette session. Aucun rebuild Docker, migration réelle ni parcours navigateur authentifié complet n'a été exécuté.
- Les deux JPG ont été reconstruits en documents éditables et comparés dans Chromium local ; les écarts artistiques sont détaillés ci-dessus. Le carré déclare désormais un format physique carré, à contrôler dans le PDF réel.
- Le storyboard est désormais disponible et sa vérification écran par écran figure en tête de ce document.
- Pas de preuve runtime de génération PDF/ZIP, décodage QR, vraie finalisation Media/ClamAV ou appels payants GPT/FLUX. Les tests financiers utilisent des dépendances contrôlées, pas le wallet d'un utilisateur réel.
- L'aperçu avant génération ne fabrique pas de QR ni d'affectation de table ; les données finales proviennent des services existants au snapshot. Vérifier visuellement les affectations sur les PDF produits.
- Un décor finalisé dans Media puis abandonné à cause d'une modification concurrente peut rester non référencé ; le dernier design de l'utilisateur est conservé.
- La personnalisation professionnelle garde sa politique de couleurs et polices enregistrées ; les tailles et déplacements libres restent réservés aux documents dont la politique les autorise.

### Vérifications exécutées dans ce complément

| Contrôle | Résultat |
| --- | --- |
| Web typecheck et lint | Réussis |
| Designs typecheck et lint | Réussis |
| Invitations typecheck et lint | Réussis |
| Tests Web (commande élargie ci-dessous) | 71 réussis |
| Tests moteur design-document | 65 réussis, dont 7 nouveaux tests des références |
| Tests Designs | 14 réussis, dont création/catalogue/ownership/version/outbox des références |
| Tests AI Design, HTTP fournisseurs intercepté | 21 réussis, aucun fournisseur réel appelé |
| Tests Invitations | 7 TypeScript + 12 JavaScript réussis ; nouvelle matrice QR des références |
| Build production Web | Réussi, Next.js 15.5.26 |
| Chromium : deux modèles + Designs desktop/mobile | Réussi, zéro exception client |
| git diff --check | Réussi après retrait des artefacts de vérification |

Total de cette passe : **190 tests unitaires réussis**, plus les essais Chromium décrits précisément ci-dessus. Les premiers nouveaux tests ont détecté le rôle `REFERENCE_BODY` absent de la liste fermée du validateur historique et la marge du libellé table carré ; les deux causes ont été corrigées, puis les suites concernées relancées avec succès. Le typecheck régénère Prisma ; les seuls artefacts sans modification de schéma ont été retirés. Sous Windows, les processus esbuild/Chromium/build ont nécessité une exécution autorisée hors sandbox (`spawn EPERM`) ; les tests utilisent `--test-isolation=none`.

Commandes reproductibles, sans Docker ni appels fournisseurs :

```powershell
pnpm --filter @invitaflow/web typecheck
pnpm --filter @invitaflow/web lint
pnpm --filter @invitaflow/designs typecheck
pnpm --filter @invitaflow/designs lint
pnpm --filter @invitaflow/invitations typecheck
pnpm --filter @invitaflow/invitations lint
pnpm --filter @invitaflow/design-document test
pnpm --filter @invitaflow/web exec node --test --test-isolation=none src/lib/*.test.mjs src/components/brand-assets.test.mjs src/components/admin/admin-shell.test.mjs src/app/events/workspace.test.mjs src/app/account/report/report-form.test.mjs src/app/agencies/agency-period.test.mjs
pnpm --filter @invitaflow/designs exec tsx --test --test-isolation=none src/*.spec.ts
pnpm --filter @invitaflow/ai-design exec tsx --test --test-isolation=none src/*.spec.ts
pnpm --filter @invitaflow/invitations exec tsx --test --test-isolation=none src/*.spec.ts
pnpm --filter @invitaflow/invitations exec node --test --test-isolation=none src/*.spec.mjs
pnpm --filter @invitaflow/web build
git diff --check
```

Les deux scripts `scripts/design/preview-reference-models.mjs` et `verify-workspace-ui.mjs` attendent `--modules=<répertoire contenant Playwright déjà installé>` et `--browser=<exécutable Chrome existant>` ; ils ne téléchargent rien. Les fichiers `qa-*.tsx` sont exclusivement des adaptateurs de test et ne sont jamais importés par la production.

### Checklist séparée des validations reportées

- [ ] **NON VALIDÉ** — parcours authentifié réel : événement → cérémonies → design accepté → invités → invitations, desktop/mobile.
- [ ] **NON VALIDÉ** — finalisation Media : présignature, quarantaine, ClamAV, Sharp, READY, détourage éventuel et application du décor privé.
- [ ] **NON VALIDÉ** — vrais appels GPT/FLUX, suivi et consommation fournisseur ; ne les lancer qu'avec autorisation de dépense.
- [ ] **NON VALIDÉ** — génération et téléchargement réels PDF/ZIP, notamment dimensions du carré et densité des photos.
- [ ] **NON VALIDÉ** — décodage des vrais QR et accès/RSVP associés, invitations avec différentes permissions de cérémonie.

Aucun Docker, déploiement, commit ou push n'a été lancé dans ce complément. La demande globale reste **partielle** tant que ces validations et les écarts de fidélité artistique demeurent.

### Fichiers supplémentaires de ce complément

Modifiés : `.env.example`, `apps/web/src/app/events/[eventId]/designs/workspace.tsx`, `apps/web/src/app/events/[eventId]/designs/designs-journey.css`, `apps/web/src/components/ProfessionalTemplateInspector.tsx`, `packages/design-document/src/index.mjs`, `packages/design-document/src/index.d.mts`, `packages/design-document/src/invitation-display.mjs`, `packages/design-document/src/professional-templates.mjs`, `services/designs/src/design-document.ts`, `services/designs/src/designs.service.ts`, `services/invitations/src/invitation-layout.mjs`, `services/invitations/src/invitation-layout.spec.mjs`, `services/invitations/src/invitation.service.ts`, ce document.

Créés : `apps/web/src/components/reference-template-preview.tsx`, `packages/design-document/src/reference-templates.mjs`, `reference-art.mjs`, `reference-script-glyphs.mjs`, `packages/design-document/assets/fonts/GreatVibes-Regular.ttf`, `OFL-GreatVibes.txt`, `packages/design-document/test/reference-templates.spec.mjs`, `services/designs/src/reference-templates.spec.ts`, `scripts/design/build-reference-font.py`, `preview-reference-models.mjs`, `verify-workspace-ui.mjs`, `qa-next-shim.tsx`, `qa-workspace-entry.tsx`, ainsi que les quatre captures de modèles/comparaisons, les quatre captures Designs et les deux rapports JSON dans `docs/design-references/reconstructed/`.

Avant validation produit : tester un mariage multi-cérémonies avec invités distincts ; un événement sans table ; continuation directe sans personnalisation ; retour/actualisation/reconnexion ; absence de clés et panne fournisseur ; import valide/invalide et reprise ; manque de crédits et double clic ; ouverture des PDF, téléchargement ZIP et lecture QR ; refus d'accès croisé entre propriétaires. Comparer les compositions aux JPG avant de qualifier un modèle de « référence fidèle ».

## Liste exacte des fichiers créés ou modifiés

- `.env.example`
- `apps/gateway/src/designs-forwarding.spec.ts`
- `apps/gateway/src/main.ts`
- `apps/web/src/app/events/[eventId]/designs/designs-journey.css`
- `apps/web/src/app/events/[eventId]/designs/page.tsx`
- `apps/web/src/app/events/[eventId]/designs/workspace.tsx`
- `apps/web/src/app/events/[eventId]/invitations/workspace.tsx`
- `apps/web/src/app/events/[eventId]/resume/page.tsx`
- `apps/web/src/app/events/workspace.tsx`
- `apps/web/src/components/ai-proposal-preview.tsx`
- `apps/web/src/components/AIComposer.tsx`
- `apps/web/src/components/EditorialAssist.tsx`
- `apps/web/src/components/event-journey.tsx`
- `apps/web/src/components/invitation-document-preview.tsx`
- `apps/web/src/lib/design-event-contract.mjs`
- `apps/web/src/lib/designs-runtime-safety.test.mjs`
- `apps/web/src/lib/event-journey.d.mts`
- `apps/web/src/lib/event-journey.mjs`
- `apps/web/src/lib/event-journey.test.mjs`
- `compose.yaml`
- `docs/event-journey-ai.md`
- `packages/design-document/src/index.d.mts`
- `packages/design-document/src/index.mjs`
- `packages/design-document/src/invitation-display.mjs`
- `packages/design-document/src/professional-templates.mjs`
- `packages/design-document/test/invitation-decor.spec.mjs`
- `packages/design-document/test/invitation-display.spec.mjs`
- `services/ai-design/src/ai-design-quota.spec.ts`
- `services/ai-design/src/ai-design.service.ts`
- `services/ai-design/src/editorial-assist.spec.ts`
- `services/ai-design/src/editorial-provider.ts`
- `services/ai-design/src/env.spec.ts`
- `services/ai-design/src/env.ts`
- `services/ai-design/src/flux-image-provider.spec.ts`
- `services/ai-design/src/flux-image-provider.ts`
- `services/ai-design/src/openai-provider.spec.ts`
- `services/ai-design/src/openai-provider.ts`
- `services/ai-design/src/preview-storage.ts`
- `services/ai-design/src/provider-resume.spec.ts`
- `services/ai-design/src/providers.ts`
- `services/designs/generated/prisma/browser.ts`
- `services/designs/generated/prisma/client.ts`
- `services/designs/generated/prisma/commonInputTypes.ts`
- `services/designs/generated/prisma/internal/class.ts`
- `services/designs/generated/prisma/internal/prismaNamespace.ts`
- `services/designs/generated/prisma/internal/prismaNamespaceBrowser.ts`
- `services/designs/generated/prisma/models.ts`
- `services/designs/generated/prisma/models/Design.ts`
- `services/designs/generated/prisma/models/DesignTemplate.ts`
- `services/designs/generated/prisma/models/EventDesignSelection.ts`
- `services/designs/prisma/migrations/202610110001_event_design_selection/migration.sql`
- `services/designs/prisma/schema.prisma`
- `services/designs/src/designs.controller.ts`
- `services/designs/src/designs.service.ts`
- `services/designs/src/journey-selection.spec.ts`
- `services/invitations/src/invitation.service.spec.ts`
- `services/invitations/src/invitation.service.ts`
