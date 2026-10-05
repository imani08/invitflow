# Phase 5 — assistance éditoriale pour les textes trop longs

## Périmètre et état

**DONE — implémentation et tests ciblés.** Le workflow `EDITORIAL_COMPRESSION` réutilise AI Design, sa table de jobs JSON, son worker, son outbox et ses quotas. Aucun microservice, migration Prisma, tarif IA ou appel par invité ajouté. Le composer graphique de Phase 6 n’est pas implémenté.

**NOT TESTED — provider réel, PostgreSQL/RabbitMQ et interface dans un navigateur authentifié.** Aucune campagne Docker, PDF batch, paiement ou E2E globale exécutée pour cette phase. La qualité linguistique et la fidélité sémantique devront être évaluées avec le modèle effectivement déployé. Les tests provider utilisent des réponses contrôlées uniquement dans les fixtures de test.

## Éligibilité et ordre des adaptations

Une déclaration `metadata.editorialFields` associe un `elementId` à un binding libre autorisé. Le champ réel pris en charge aujourd’hui est **`event.invitationText`**. Les recettes professionnelles déclarent leur élément `invitation` et `AI_ASSIST_ALLOWED`. Les noms, dates, lieux, accès, dress codes, tables, contacts et QR restent des bindings structurés exclus. Une politique `AI_ASSIST_ALLOWED` seule ne rend pas un champ éligible.

Le resolver choisit d’abord la variante selon les cérémonies, puis réalise le fitting déterministe jusqu’à la taille minimale. L’assistance apparaît seulement si ce champ déclaré dépasse encore. Une déclaration valide sans overflow ne permet pas de créer un job. Aucune disposition ni coordonnée n’est proposée par l’IA.

Les documents historiques qui ne déclarent pas ces champs ne sont pas automatiquement rendus résumables. Le script de publication existant produit les nouvelles déclarations; une nouvelle version de template publiée avec `--new-version` ne modifie jamais les anciens Designs. Un ancien Design doit être remplacé volontairement par une composition publiée compatible pour bénéficier de l’assistance. Les autres contenus éditoriaux pourront être ajoutés à la liste autorisée lorsqu’un binding réel existe; aucun champ fictif n’a été créé.

## Routes et jobs existants

Pas de nouvelle route Gateway ni de nouveau contrôleur. Les routes authentifiées existantes sont étendues :

- `POST /v1/events/:eventId/designs/:designId/validate` : contexte éditorial et cible issus du Design et de l’événement réels, en plus de la validation existante.
- `POST /v1/events/:eventId/designs/:designId/ai-jobs` : corps `{ workflow: "EDITORIAL_COMPRESSION", elementId, sourceVersion, language, tone, compressionLevel, protectedTerms? }`.
- `GET .../ai-jobs/:jobId` : suivi et proposition éditoriale; contrôle du propriétaire, événement et Design.
- `DELETE .../ai-jobs/:jobId` : annulation des jobs éditoriaux QUEUED, PROCESSING ou PROPOSED. La finalisation du worker ne peut pas réactiver un job annulé.
- `POST .../ai-jobs/:jobId/retry` : réutilise les retries bornés existants; un job éditorial périmé ou obsolète est refusé.
- `PUT /v1/events/:eventId/designs/:designId` : acceptation explicite avec `{ editorialJobId, expectedVersion }`.
- Même `PUT` pour une correction manuelle explicite : `{ editorialText, elementId, sourceText, expectedVersion }`.

Le frontend passe par les mêmes routes sous `/api/events/...`. Sessions, contrôles d’origine et permissions existantes sont conservés. AI Design lit Designs via HTTP authentifié; Designs vérifie une proposition via AI Design. Aucun accès SQL croisé entre services.

États persistés : QUEUED → PROCESSING → PROPOSED ou FAILED; CANCELLED pour l’annulation. PROPOSED est l’équivalent du succès de production d’une proposition, pas de son acceptation. STALE et EXPIRED sont des états calculés à la lecture. Durée de validité : une heure depuis la création; aucune proposition périmée ne peut être appliquée. La rétention existante des jobs reste de trente jours.

## Données envoyées au provider

La requête provider contient exclusivement : `text` masqué, `language`, `tone`, `compressionLevel`, `targetLength`, `maxEstimatedLines` et `targetReductionRatio`. La version source reste dans le job interne et n’est pas transmise.

Ni DesignDocument, coordonnées, Event/Guest, autres invités, assets, noms structurés, tables, contacts, QR, identifiants événement/Design/job ni accès de cérémonie ne sont envoyés au provider. Le service conserve un contexte limité du champ dans son JSON de job pour vérifier le résultat; ce contexte n’est pas transmis au modèle.

Le provider est abstrait par `EditorialProvider`. L’implémentation actuelle utilise la configuration self-hosted existante : `AI_PROVIDER=self-hosted`, `AI_PROVIDER_URL`, `AI_PROVIDER_MODEL`, `AI_PROVIDER_API_KEY` si requis. Aucun fallback mock ou raccourcissement simulé ne remplace le provider absent. Designs utilise `AI_DESIGN_SERVICE_URL`, par défaut `http://ai-design:3008`; en exécution sans Compose, régler cette URL vers le service réel.

`AI_EDITORIAL_LANGUAGES` est optionnel, défaut `fr,en`. Lingala exige l’ajout explicite de `ln` et un modèle qualifié. Une vérification lexicale conservatrice refuse une langue manifestement différente ou impossible à vérifier; ce filtre n’est pas un classificateur linguistique universel. Il peut refuser des textes valides pauvres en mots reconnaissables. Dans ce cas, utiliser la correction manuelle. Pas de traduction automatique.

## Compression et validation

- LIGHT : cible maximale de 85 % de la longueur source, pour une réduction légère.
- BALANCED : cible maximale de 68 %, pour une réduction équilibrée.
- CONCISE : cible au plus égale à 60 % et à la capacité estimée de la zone.

La capacité est calculée par fitting de préfixes du texte source. Cette estimation ne garantit pas que toute reformulation de même longueur tienne : chaque réponse est refittée dans le champ résolu de la variante sélectionnée. Le provider reçoit des consignes de fidélité, ton, langue et absence d’invention. Les pourcentages sont des objectifs; le contrôle ne constitue pas une preuve de fidélité sémantique. La confirmation humaine reste obligatoire.

Une réponse vide, non raccourcie, au-delà de sa cible, de langue incorrecte/non vérifiable ou altérant une information protégée échoue. Une proposition plus courte qui respecte la cible mais déborde encore est conservée avec `fits=false` : affichable pour comparaison, impossible à accepter. L’utilisateur peut choisir une réduction plus forte, une autre composition ou une correction manuelle.

## Protection des fragments

Le contexte extrait les valeurs structurées de l’événement uniquement lorsqu’elles figurent déjà dans le texte libre. Les fragments explicitement protégés par le client doivent appartenir au texte source. Dates françaises/anglaises usuelles, jours, heures/nombres, emails, URLs et certaines formes d’adresse sont également détectés.

Ces fragments sont remplacés par des placeholders avant l’appel. Le masquage s’effectue en une passe sur la source, afin qu’un nombre protégé ne puisse pas corrompre un placeholder créé précédemment. La réponse doit conserver chaque placeholder, son nombre d’occurrences et son ordre relatif d’origine. Après restauration, les fragments protégés sont revérifiés et les nouvelles données numériques/liens/adresses détectables sont refusés. Une suppression, duplication, altération ou permutation produit `REJECTED_PROPOSAL`.

La détection n’est pas une reconnaissance exhaustive des noms propres, adresses ou faits. Le client doit marquer les fragments importants qui ne sont pas automatiquement reconnus. L’interface n’annonce aucune proposition comme sémantiquement sûre avant sa relecture et son acceptation.

## Acceptation, original et versionnement

La proposition reste dans le job; elle ne modifie ni Event ni Design. L’acceptation vérifie statut, expiration, version, texte source actuel, fragments protégés et fitting. La lecture du job compare aussi la géométrie pertinente du champ à celle de la demande. Les modifications locales non enregistrées bloquent l’acceptation dans l’éditeur.

Designs construit lui-même le changement depuis le document persisté : seuls le texte éditorial choisi et sa provenance sont ajoutés dans `metadata.editorialOverrides`. La transaction existante compare la version, crée une nouvelle `DesignVersion` et un événement outbox `design.editorial.selected.v1`. Aucune version historique n’est modifiée. La provenance conserve `sourceText`, `sourceVersion`, `selectedText`, `jobId` pour l’IA et `origin=AI_ASSISTED` ou MANUAL. L’original reste récupérable depuis cette provenance et l’historique; la restauration utilise une version historique authentifiée du même Design.

L’override est résolu par le moteur partagé dans Web et Invitations. Il s’applique au texte commun avant les données Guest/Table. Aucun appel IA n’existe dans le rendu par invité. Aucun label AI_ASSISTED n’est imprimé. Après acceptation, l’éditeur recharge et résout le Design. La validation existante avant réservation de crédits continue de bloquer une génération invalide.

## UI

L’éditeur existant affiche l’action après overflow, un modal natif avec focus géré, Original/Proposition, langue, ton, niveaux, fragments protégés, état du job, correction manuelle, acceptation et annulation. Les panneaux utilisent les styles existants et des contrôles adaptés au mobile. Une proposition ne devient jamais active via polling, fermeture du modal ou changement de niveau.

## Limites, coûts et erreurs

Entrée : 12 000 caractères; fragments fournis : au plus 50; timeout provider : 30 secondes; trois nouvelles propositions éditoriales par Design/version; retries bornés par les trois tentatives existantes. Les quotas propriétaire/global/horaire existants s’appliquent dans une transaction avec verrous. Aucun retry infini ni facturation IA ajouté.

Les jobs fournissent les comptes et statuts. Les propositions enregistrent durée et usage tokens si le provider les retourne; les événements outbox enregistrent succès/échec et durée sans texte ni fragments privés. L’usage d’une requête ayant échoué avant une réponse exploitable n’est pas connu. Aucun chiffre n’est inventé.

Erreurs contrôlées : provider_unavailable, provider_timeout, provider_rate_limit, unsupported_language, wrong_language, language_unverified, empty_response, not_shorter, target_exceeded, REJECTED_PROPOSAL, invalid_proposal, quotas, STALE et EXPIRED. L’original reste intact dans tous ces cas.

## Validation de cette phase

- DesignDocument : **48/48**, dont fitting, niveaux, masquage, sélection, données structurées interdites et validation v2.
- AI Design ciblé : **11/11**, incluant quotas, annulation, expiration/stale, contrat provider minimal, erreurs et résultat encore trop long.
- Designs ciblé : **9/9**, incluant acceptation explicite, version immuable, restauration, refus, isolation propriétaire et sélection manuelle.
- Web ciblé : **7/7**, helpers de sélection et prévisualisations existantes.
- Invitations layout : **6/6**, incluant plusieurs invités sans appel IA et validation du texte choisi.
- Typechecks Web/AI Design/Designs/déclarations partagées; ESLint ciblé; `git diff --check`.

Lien workspace `@invitaflow/design-document` ajouté à AI Design et importer pnpm correspondant mis à jour. Aucun paquet externe installé. Aucun changement Docker, Gateway, Keycloak, Prisma, Billing/Wallet ou génération PDF/ZIP.

**PHASE 5 COMPLETE: YES — implémentation et validations ciblées; campagne provider/runtime et E2E différée.**
