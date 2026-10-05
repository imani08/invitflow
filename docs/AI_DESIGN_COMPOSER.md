# Phase 6 — AI Design Composer

## Périmètre

Le Composer fabrique des propositions Design v2 à partir du registre de recettes et des données nécessaires à l’événement. Le terme « AI » décrit ici l’assistance de composition : la sélection fonctionne localement et de façon déterministe. Aucun provider LLM n’est appelé dans cette version. Aucun SVG libre, coordonnée fournie par un modèle, portrait, texture ou décoration nouvelle n’est généré.

Le catalogue est extensible par `PROFESSIONAL_RECIPES` et leurs familles/profils. Il n’existe aucune constante de six templates ni un nombre maximal codé de familles. Le registre initial contient six recettes de référence, quatre palettes contrôlées et des stratégies photo adaptées aux recettes : davantage de combinaisons sont produites sans dupliquer des documents statiques.

## Grammaire et compatibilité

Le document validé expose les dimensions contrôlées `family`, `layoutRecipe`, `mediaStrategy`, `photoRequired`, `photoComposition`, `ceremonyLayout`, `guestHeaderLayout`, `tableLayout`, `palette`, `paletteId`, `fontSet`, `maskSet`, `decorationSet` et `backgroundTreatment`. Elles restent liées aux valeurs enregistrées par la recette. La validation refuse coordonnées, calques et dimensions non déclarés.

Chaque profil publie ses `supportedEventTypes`, `supportedMediaStrategies`, `supportedCeremonyCounts`, `supportedTextDensity`, capacités table/QR/dress code et tags de style, humeur et palette. Les familles photo initiales ciblent WEDDING et DOT. Les recettes sans photo sont générales et couvrent les autres types actuels; ajouter un nouveau type ou une recette se fait par extension du registre. Les variantes cérémonielles sont 0, 1, 2, 3 et 4+.

Stratégies implémentées : `NO_PHOTO`, `SINGLE_PHOTO`, `BACKGROUND_PHOTO`, `FOREGROUND_PHOTO`, `MULTI_PHOTO`. Une stratégie qui exige deux images est éliminée si moins de deux photos privées READY sont disponibles. Sans photo, seules les recettes NO_PHOTO passent le filtre. Avec des photos, les deux sortes de composition restent candidates, sauf préférence explicite « avec photo » ou « sans photo ». Les orientations et dimensions réelles servent à choisir un média et noter son adéquation au slot.

## Données d’entrée et confidentialité

La route authentifiée `POST /v1/events/:eventId/designs/composer/proposals` prend une seed, des préférences UI bornées et les empreintes déjà montrées. Le serveur lit lui-même l’événement avec le bearer propriétaire et l’inventaire Media du même propriétaire. Il ne prend aucune donnée Event ou photo de confiance depuis le corps client.

La composition utilise le type et nom d’événement, le texte éditorial commun, la date/lieu connus, les champs des cérémonies et leur nombre, une classe de densité, puis les seules métadonnées photo nécessaires (ID Media privé, dimensions, statut et catégorie). Aucun nom, email, téléphone, RSVP ou enregistrement Guest n’est chargé. Les QR et tables restent des bindings conditionnels résolus pour chaque invitation. Le resolver utilise seulement des valeurs locales génériques de stress lors de la validation de composition; elles ne sont ni affichées dans les cartes, ni persistées comme contenu.

Les photos sont lues en pagination Media, limitées aux 2 000 premières photos READY par compte pour cette génération. Seules 3 à 6 propositions maximum sont rendues. En cas d’indisponibilité de Media, la requête échoue sans inventer de photos; relancer avec le service disponible. Aucun provider externe ne reçoit de données.

## Interprétation, filtrage et score

Les préférences prédéfinies et la petite description libre sont interprétées par un dictionnaire local déterministe (styles, moods, couleurs, avec/sans photo). Il n’y a pas de LLM obligatoire. Les tags connus servent de fallback effectif, même si aucun provider n’est configuré.

Le moteur élimine d’abord les recettes incompatibles avec le type, le compte de cérémonies, la densité autorisée, les capacités demandées et les disponibilités photo. Pour chaque combinaison recette/stratégie/palette restante, il construit le Design, choisit ses slots, exécute `resolveDesignLayout` sur l’événement, puis vérifie les erreurs bloquantes et la résolution d’image d’impression. Un candidat invalide ne figure jamais dans le résultat.

Chaque candidat expose un score inspectable, échelle 0–100 :

- compatibilité : 22 % ;
- style et palette : 25 % (la composante stylistique rapproche les tags demandés des tags recette; la composante palette rapproche couleurs souhaitées et palette contrôlée);
- adéquation média/crop : 16 % ;
- cérémonie : 17 % ;
- diversité : 20 % après pénalités de similarité.

Le score de densité réduit la priorité d’une recette marquée minimaliste lorsque le programme est dense. Le score n’autorise jamais un candidat éliminé par le resolver.

## Seed, diversité et répétition

La seed est générée par le navigateur pour chaque demande. Un PRNG local pondère la sélection à partir du score; même seed, même Event, mêmes préférences et mêmes médias READY donnent le même ordre et les mêmes documents. Une seed nouvelle change la sélection contrôlée.

L’empreinte canonique inclut la composition enregistrée (famille/recette, stratégie, palette, fonts, masques, décorations et dimensions de layout). Les photos et détails Guest en sont exclus. Une pénalité additionne les ressemblances : même famille 55, même stratégie 17, même palette 17, même recette 38 et même orientation photo 8, plafonnée à 100. Si trois familles compatibles existent, une sélection de quatre garantit d’abord trois familles distinctes.

Les empreintes vues pendant le parcours sont renvoyées lors de « Proposer autre chose ». Designs ajoute aussi celles des 200 derniers Designs actifs de cet événement/propriétaire. L’historique des propositions seulement vues est conservé en mémoire UI de la session, sans table ni migration; les Designs effectivement choisis conservent l’empreinte et la seed dans leur document.

## Prévisualisation, choix et versionnement

La route `POST .../composer/select` reçoit le document choisi. Le backend relit l’événement et les photos privées, régénère le set avec la seed, les préférences interprétées et les empreintes évitées, puis compare le document complet au résultat autorisé. Une composition modifiée ou devenue périmée est refusée.

À la sélection, le serveur crée un Design en version 1, une ligne DesignVersion immuable et un événement outbox. Il enregistre dans `metadata.composer` : `composerVersion=AI_COMPOSER_V1`, seed, recette/release, palette, stratégie média, variante cérémonie, IDs des photos utilisées, empreinte, préférences interprétées et score. `templateId` reste nul : la création ne dépend pas d’une recette déjà publiée dans le catalogue DB. Aucun historique n’est réécrit. Les changements postérieurs passent par le versionnement existant.

Les previews Web utilisent le resolver v2 et les vraies données d’événement ainsi que les previews privées Media. Les données Guest/Table/QR restent vides dans les cartes tant qu’il n’y a pas de vrai Guest sélectionné. Mobile : liste horizontale scrollable avec snap et aperçu grand format. Choisir crée réellement le Design et ouvre l’éditeur.

Le compteur configurable accepte 3–6 propositions, défaut 4. Les choix « classique, floral, moderne, minimaliste, africain contemporain, luxueux », ambiances, couleurs, photo et description se traduisent en tags/préférences bornés. Le bouton de régénération garde ces contraintes et change la seed.

## Provider, coûts et limites

Le Composer est actuellement autonome : pas de provider, de requête IA par invité, de génération d’image, de crédits invitation, de Billing/Wallet ni de migration Prisma. Une future interprétation LLM devra retourner uniquement des tags d’une liste fermée; le filtre et le score local resteront l’autorité. Les performances de composition avec un très grand inventaire (>2 000 photos READY) nécessitent une pagination/règle de sélection dédiée.

Les recettes initiales sont centrées invitation mariage/dot pour les versions photo; les autres types sont couverts par le registre sans photo, mais requièrent une QA éditoriale/visuelle avant de publier une famille vraiment spécialisée (funérailles, conférence, anniversaire, gala, etc.). Le mode 4+ cérémonie est validé par le resolver; les contenus trop denses qui débordent toutes les recettes donnent moins de trois propositions et l’UI demande de modifier les préférences ou le contenu.

## Validation

Tests ciblés couvrent 1/4 cérémonies, wedding/dot/birthday, sans/avec photo, cinq stratégies, orientations réelles, texte dense, table/QR/dress code, couleurs et préférences minimalistes, seed reproductible et différente, exclusion des empreintes, diversité minimale, fallback local sans appel provider, persistance seulement au choix et refus d’un document altéré. Le provider réel n’est pas applicable tant qu’il n’est pas utilisé; Docker/E2E global reste différé.
