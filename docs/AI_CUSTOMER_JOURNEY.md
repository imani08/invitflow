# Parcours client AI Design

## Écrans et progression

Le parcours vit dans l’espace Design de l’événement existant : résumé de l’événement, choix photo, préférences, propositions, puis workspace Design. Les données d’événement et les cérémonies sont reprises depuis Events; le Composer ne crée pas de copie de l’événement. Le lien de modification renvoie à la liste/gestion d’événements existante.

Les quatre étapes courtes conservent leurs valeurs dans l’état de la page : événement, médias, style, puis propositions. Revenir à une étape antérieure ne relance pas la composition. Les préférences ne sont pas persistées avant le choix définitif.

## Événements et médias

Les types sont validés contre `PROFESSIONAL_RECIPES.supportedEventTypes`, registre partagé avec le Composer. Les recettes photo sont limitées aux types indiqués par le registre; recettes NO_PHOTO assurent le catalogue des autres types actuels. Un type sans aucune recette est signalé sans prétendre à une compatibilité.

L’étape médias propose explicitement « Laisser InvitaFlow décider », « Avec mes photos » et « Sans photo ». Elle affiche les médias privés READY, leur miniature, orientation et dimensions; l’utilisateur peut en sélectionner jusqu’à 20. Un nouveau fichier peut être téléversé dans Media depuis cette étape et est validé avant de rejoindre la sélection. Le navigateur envoie uniquement les identifiants et le Composer retrouve les dimensions via Media authentifié. Aucun fichier photo n’est envoyé à Designs/Composer. Sans sélection explicite, le Composer peut choisir dans l’inventaire; « Sans photo » transmet une liste vide et ne fournit aucun candidat photo.

## Préférences et propositions

Les choix client (style, humeur, couleurs, média et description facultative) sont transmis aux préférences déterministes du Composer. Le champ libre est interprété par le dictionnaire local Phase 6; aucune compréhension LLM n’est promise. Les choix d’affinage préremplissent une direction de style. Les palettes demeurent issues du registre contrôlé.

La génération demande quatre propositions par défaut (sélecteur 3 à 6), affiche une progression et garde le lot précédent visible pendant une régénération. « Voir d’autres propositions » utilise une nouvelle seed et les fingerprints déjà vus. Les cartes et l’aperçu grand format affichent le document v2 résolu sur les informations de l’événement, jamais les scores ou la seed. Aucun candidat ne produit un état vide compréhensible et des pistes de modification.

Les lots provisoires vivent dans l’état navigateur et ne créent aucun Design. Seuls les médias privés sont téléchargés pour produire les miniatures locales; la sélection utilise les identifiants, pas les blobs.

## Choix, reprise et personnalisation

À la sélection, l’API Phase 6 recompose et vérifie exactement la proposition. La transaction crée un Design, sa version immuable 1 et l’événement outbox correspondant avec les métadonnées de reproductibilité. Le workspace existant s’ouvre. L’assistance éditoriale Phase 5 reste une action explicite; le texte n’est jamais raccourci automatiquement.

Si un Design existe déjà, l’interface propose de continuer le premier Design enregistré ou d’explorer d’autres propositions. Créer depuis une nouvelle proposition demande confirmation et crée un Design distinct; l’ancien n’est pas remplacé. À la revisite, la liste des Designs enregistrés est chargée et aucun Composer n’est relancé automatiquement.

Le QR reste un binding conditionnel; le preview désactive les données d’invité réelles. Les bindings Table et QR sont absents s’ils ne résolvent pas de données. Les propositions et les cartes n’ajoutent pas de faux invité, de fausse table, de faux QR final ni de faux asset.

## Limites et validations

- Les imports respectent les limites existantes de Media et de taille de fichier.
- Le champ de style libre est un parser local à dictionnaire, pas un modèle sémantique.
- Les types, recettes et stratégies disponibles restent limités au registre professionnel publié; aucune promesse catalogue future n’est affichée.
- Aucun événement d’analytics produit dédié n’est émis actuellement.
- Navigation mobile par cartes/carrousel, previews responsive, boutons nommés et labels sont prévus; navigateur authentifié et lecteur d’écran restent à valider manuellement.
- Docker complet, services runtime et gros E2E ne font pas partie de la validation Phase 7.
