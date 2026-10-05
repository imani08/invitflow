# Phase 4 — templates professionnels

Statut implémentation Phase 4 : **DONE** (périmètre de reprise). Runtime de publication : **NOT TESTED**. Parité photographique stricte : **PARTIAL**. Les compositions et le parcours de personnalisation sont implémentés. La publication PostgreSQL/Media et le worker Linux ne sont pas validés en runtime. La comparaison pixel stricte des rendus photographiques reste ouverte.

## Familles

| Famille | Objectif original | Palette | Photos et masks | Assets |
| --- | --- | --- | --- | --- |
| Botanical Elegance | Ivoire, photo aquarelle, feuillage périphérique, programme inférieur et marges respirantes | `#F7F4EB`, `#263F34`, `#879580`, `#A88650` | mainPhoto, `watercolor-soft-01`; PNG détouré possible | Branche originale générée pour InvitaFlow, à enregistrer dans Media privé |
| Photo Editorial Luxury | Affiche photographique, fond estompé, date dominante, accents sable | `#F3EDE1`, `#292622`, `#C2A271`, `#D6C3A9` | mainPhoto, backgroundPhoto avec overlay ivoire, secondaryPhoto `organic-portrait-01`; même photo réutilisable ou photos distinctes | Photos du client uniquement en production |
| African Contemporary | Rythmes géométriques originaux, ivoire/terre/prune/or, photographie organique | `#F6EFE2`, `#392339`, `#986C4C`, `#BE995F` | mainPhoto, `organic-portrait-01`; PNG détouré possible | Géométrie native originale, aucun motif culturel emprunté |

Chaque famille : **5 variants**, dont zéro cérémonie, puis 1, 2, 3 et `multiCeremony` à partir de 4. Programme : une section large, deux colonnes, trois colonnes, puis grille 2 × 2. À trois/quatre cérémonies, les zones photo/date/texte sont recomposées. Plus de quatre cérémonies reste soumis aux diagnostics de taille : aucune garantie de mise en page universelle.

Canvas logique 1480 × 2100, sortie 148 × 210 mm, safe area 80 unités sur chaque bord, bleed 0. Zones et slots explicités en metadata. Georgia pour les identités/titres, Arial pour le programme; aucune font téléchargée ou redistribuée. Leur disponibilité exacte dans Chromium Linux doit encore être vérifiée.

Programme : minimum 28 unités logiques (environ 7,9 pt en A5), interligne 1,1. Les longs lieux/adresses restent soumis au diagnostic de débordement; ils ne sont pas tronqués. Les petites mentions secondaires ont une hiérarchie distincte.

## Bindings et limites

Invité, table, titre événement, mariés, texte d’invitation, date événement, contact, nom/date/heure/lieu/adresse/référence/dress code de cérémonie, QR lorsqu’autorisé. Table et son libellé disparaissent ensemble. Les champs absents restent absents. Aucun nom, date ou lieu métier n’est intégré aux documents de production.

Familles des mariés, type de cérémonie et palette dress code ne disposent pas d’un binding structuré dans le moteur actuel : aucun champ ou swatch inventé. Les noms de cérémonies réels sont utilisés. La date reste la valeur du snapshot existant, sans parser silencieusement une date arbitraire.

Les limites de texte restent visibles. Pas de résumé IA. La photo principale est obligatoire uniquement pour les recettes déclarant `photoRequired: true`. Les recettes `NO_PHOTO` sont valides sans photo et n’ont aucun slot photo. Les photos basse résolution et les débordements conservent les diagnostics du moteur.

## Personnalisation protégée

Photos dans les slots déclarés, zoom/focal point, réutilisation mainPhoto en fond/secondaire, deux couleurs de texte contrastées par famille, Georgia/Arial. Les bindings continuent à lire les données de l’événement : le texte éditorial se modifie dans les données métier existantes.

Grille, marges, tailles, programme, stack, masques et décorations restent verrouillés. Le serveur compare au document persisté; supprimer les metadata ou déplacer une image par requête directe est refusé. Les anciens designs restent dans leur éditeur habituel.

Le catalogue charge le document réel via l’API existante. Seule l’identité invité de catalogue porte une mention **DEMO**; elle n’est jamais sauvegardée dans un événement. Les PNGs de démonstration et de revue ci-dessous ne sont pas servis depuis `apps/web/public`.

## Références : principes et différences

**Botanical / modèle 1 :** nom invité dominant, photo centrale artistique, table indépendante, programme inférieur et végétation périphérique conservés comme principes. Cadres annotés, noms et photos de la référence supprimés. Nouvelle branche, nouvelle palette et grille originale; programme adapté au nombre réel de cérémonies et table conditionnelle.

**Editorial / modèle 2 :** portrait photographique, profondeur fond/sujet, date graphique et hiérarchie verticale conservés comme principes. Le texte et le programme ont des zones distinctes pour limiter les collisions; l’image de fond est contrôlée par opacité/overlay. Les vraies informations sont liées au snapshot, sans transcription des données de référence.

Revue graphique locale : hiérarchie invité > mariés > texte > programme, alignement des colonnes, couleurs contrastées, marges stables, espaces intentionnels et programme sans cartes de dashboard. Les cadres photo très horizontaux des variants 3/4 nécessitent un réglage focal selon la photo réelle. Une vraie revue mobile dans le parcours authentifié reste à faire.

## Assets et publication

Sources : `docs/template-assets/`. La branche générée est un PNG RGBA 1024 × 1536, alpha mesuré 0–254. La photo catalogue est **DEMO uniquement**, créée avec des personnes fictives. Elle n’est pas intégrée par le script de publication.

La publication exige un manifeste contenant un véritable ID Media et ses dimensions. Aucun UUID fictif n’est seedé. Upload via le workflow existant (quarantaine, validation, stockage privé). La lecture intercompte concerne uniquement les décorations explicitement déclarées dans une version publiée, avec autorité Designs authentifiée par le token interne existant. Une panne ou un refus n’accorde aucun accès; modifications et suppression restent réservées au propriétaire.

Publication transactionnelle dans la DB Designs seulement : verrou par slug, version immuable, outbox. Une composition identique est ignorée; un changement requiert `--new-version`. Les anciens designs ne sont pas réécrits. Aucune migration ou modification de Prisma, Billing, Wallet, Payments, Keycloak, Gateway ou Docker.

### Commandes locales lorsque Docker fonctionne

Les services existants doivent être construits avec les changements et opérationnels. Renseigner un token OIDC valide du compte opérateur, sans le committer ni le partager.

Le secret interne existant `STORAGE_MONITOR_TOKEN` doit être identique dans Media et Designs et comporter au moins 32 caractères. La publication refuse son absence; la lecture intercompte échoue fermée si les deux valeurs diffèrent.

```powershell
Set-Location D:\invitflow\invitaflow
$env:TEMPLATE_ASSET_TOKEN = '<TOKEN_OIDC_OPERATEUR>'
$env:MEDIA_BASE_URL = 'http://127.0.0.1:3002'
node scripts/upload-professional-template-assets.mjs
docker compose cp "$env:TEMP\invitaflow-template-assets.json" designs:/tmp/invitaflow-template-assets.json
docker compose exec -T -e "TEMPLATE_ASSET_TOKEN=$env:TEMPLATE_ASSET_TOKEN" -e MEDIA_BASE_URL=http://media:3014 designs node dist/src/publish-professional-templates.js --assets=/tmp/invitaflow-template-assets.json --publish
Remove-Item Env:TEMPLATE_ASSET_TOKEN
```

Le script d’upload s’exécute sur Windows via Gateway pour que l’URL publique MinIO `localhost:9000` soit accessible. Le script de publication utilise la DATABASE_URL déjà configurée dans Designs. Avant une nouvelle version, réutiliser le manifeste existant : ne pas retéléverser le même décor inutilement. Ajouter `--new-version` seulement pour publier une composition modifiée. Ces commandes n’ont pas été exécutées contre Docker.

## Validation et reproduction

Matrice : 960 combinaisons pour les trois familles (0–4 cérémonies, noms courts/longs, photo portrait/paysage, texte court/long, table, dress code et contact présents/absents). Tests supplémentaires : personnes/couple/famille/titre, texte moyen, débordement, slots, suppression des locks, ajout BG/secondaire, QR réel en zone réservée. Tests unitaires, pas E2E.

Résultats ciblés de la session précédente : design-document **38/38**, Designs **6/6**, Invitations **10/10**, Web **8/8**, Media **8/8**. Typechecks Web/Designs/Media/Invitations et déclarations partagées; ESLint ciblé; contrôle de whitespace Git. La comparaison pixel stricte constitue un échec distinct des tests unitaires.

12 previews, SVG et PDFs A5 produits avec Chrome Windows local. Exemples et mesures dans `docs/template-previews/`. Composition revue visuellement, mais **seuil pixel strict non validé** : différences de rasterisation visibles sur contours texte/photos et un trait fin dans certains PDFs masqués. Ne pas annoncer une parité pixel parfaite. Les mesures par cas sont conservées, sans relever le seuil pour masquer l’échec.

```powershell
node scripts/validate-professional-templates.mjs '--modules=C:\Users\imani\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules' '--browser=C:\Program Files\Google\Chrome\Application\chrome.exe'
$qaDir = Join-Path $env:TEMP 'invitaflow-templates-phase4'
Get-ChildItem -LiteralPath $qaDir -Filter '*.pdf' | ForEach-Object { pdftoppm -png -r 96 -singlefile $_.FullName (Join-Path $qaDir ($_.BaseName + '-pdf')) }
python scripts/compare-design-visual.py $qaDir --report-only
```

`--report-only` écrit tous les résultats et les flags d’échec; sans cette option, le seuil strict continue à provoquer un échec. Aucune installation de dépendance.

**DONE** : factory v2, variants, bindings, slots, locks client/serveur, catalogue réel, assets sources originaux, scripts de publication, tests ciblés et PDFs Chrome.

**PARTIAL** : qualification graphique finale sur photos réelles; comparaison pixel stricte; personnalisation limitée aux réglages déclarés (pas de libre composition).

**NOT TESTED** : upload/lecture intercompte/publication réelle PostgreSQL-MinIO, immutabilité en DB lors d’une seconde publication, parcours Next/OIDC complet, responsive authentifié, worker Chromium Linux.

**BLOCKED** : Docker local répond `permission denied` sur `dockerDesktopLinuxEngine`; les templates ne sont pas déclarés publiés en production. Pas de Phase IA démarrée.

## Reprise — compositions sans photo et contrat média

| Famille | Recette avec photo | Recette sans photo | Masks photo |
| --- | --- | --- | --- |
| Botanical Elegance | botanical-elegance | botanical-illustration | watercolor-soft-01 |
| Photo Editorial Luxury | photo-editorial-luxury | typographic-luxury | none; organic-portrait-01 pour la secondaire |
| African Contemporary | african-contemporary | african-contemporary-graphic | organic-portrait-01 |

Six recettes dans un registre extensible, aucune limite de trois templates. Les trois recettes photographiques déclarent SINGLE_PHOTO et photoRequired=true : mainPhoto obligatoire, fond/secondaire facultatifs pour Editorial. Les trois recettes sans photo déclarent NO_PHOTO, photoRequired=false et photoSlots=[]. Elles recomposent noms, grande date, texte et programme, sans rectangle photo vide. Botanical est facultatif au niveau du choix de composition : sans photo, choisir Botanical Illustration; la recette photographique conserve sa contrainte explicite. OPTIONAL_PHOTO n’est pas annoncé pour une recette dont le moteur ne pourrait pas recomposer automatiquement le document.

Chaque recette possède cinq variantes de cérémonies : 0, 1, 2, 3, puis >=4; au-delà de quatre, les diagnostics restent applicables. Palettes identiques au tableau des familles; polices Georgia/Arial; palettes guidées limitées aux deux couleurs de texte autorisées. Les recettes sans photo ont maskSet=[]; elles conservent les décorations privées Botanical ou la géométrie native. Bindings identiques aux compositions photographiques.

Metadata de composition : family, layoutRecipe, mediaStrategy, photoRequired, photoComposition, ceremonyLayout, guestHeaderLayout, tableLayout, palette, fontSet, maskSet, decorationSet. Aucun AI Design Composer implémenté.

Le catalogue inspecte les médias privés PHOTO/READY du compte via l’API existante, avec pagination. Il ne prétend pas qu’ils appartiennent à cet événement. hasPhotos/photoCount/photoOrientation sont déduits des données réelles; les recettes actuelles acceptent toutes les orientations. Sans photo, seules les recettes connues compatibles sans photo sont proposées. Les templates historiques hors registre restent disponibles selon leurs règles existantes. Inventaire indisponible : message explicite, aucun compte inventé, recettes sans photo conservées. Les slots photo et commandes libres de création de calques disparaissent dans la personnalisation NO_PHOTO. Le garde serveur de structure reste actif.

Publication : le script valide désormais les six recettes; utiliser --new-version si une ancienne recette a déjà été publiée et que son contrat metadata change. Les versions précédentes restent immuables. Aucune publication réelle effectuée pendant cette reprise.

Validations de reprise : moteur partagé 40/40; Web ciblé 5/5; Invitations layout 5/5; Designs 6/6 (six recettes); typechecks Web/Designs/déclarations; lint Web ciblé; validation publication sans écriture; git diff --check. La campagne complète E2E/runtime est reportée conformément à la demande.

PARTIAL — photographic pixel parity : conserver les 12 PDF A5 déjà examinés, écart maximal MAE 4,0751/255 et pixels différents 5,361 %, essentiellement photographies/contours; aucune divergence structurelle observée. Pas de nouvelle campagne pixel.

NOT TESTED — rendu visuel navigateur/PDF des nouvelles recettes sans photo, parcours authentifié responsive, publication réelle et worker Linux. BLOCKED — accès Docker Desktop refusé lors de la session précédente. Aucune migration ni configuration Docker modifiée.

## Grammaire contrôlée et diversité — fondations uniquement

Les trois familles sont des références initiales, pas une limite de catalogue. Le registre associe plusieurs recettes à une famille (photo/sans photo aujourd’hui). Ajouter une direction exige une recette autorisée, des primitives v2 et sa validation graphique; aucune constante ne plafonne le nombre de familles ou recettes.

PROFESSIONAL_GRAMMAR_FIELDS et ProfessionalComposition exposent les dimensions family, layoutRecipe, mediaStrategy, photoRequired, photoComposition, ceremonyLayout, guestHeaderLayout, tableLayout, palette, fontSet, maskSet, decorationSet et backgroundTreatment. Les compositions existantes déclarent SOLID_PAPER; le fond photo Editorial reste un slot facultatif distinct. Ce contrat ne prétend pas fournir déjà tous les traitements de fond futurs.

validateProfessionalComposition refuse les dimensions inconnues, coordonnées arbitraires et assemblages incompatibles avec la recette enregistrée. Les combinaisons autorisées viennent des compositions réellement implémentées : pas de produit cartésien libre de palettes/masks/layouts. Les ajustements guidés restent régis par leur propre politique de personnalisation existante. Le contrôle de grammaire est une fondation exportée, pas un nouvel endpoint IA.

professionalCompositionFingerprint produit un descripteur canonique versionné, sans collision de hash, indépendant de l’ordre des propriétés et des ensembles fonts/masks/décorations. L’ordre de palette est conservé car il détermine les rôles des couleurs. L’empreinte exclut données personnelles, IDs médias, seed et version de sauvegarde : elle compare la recette de composition, pas l’identité du client. Le futur scoring de similitude devra aussi considérer les réglages effectifs et la présence de photos fond/secondaire; aucun historique client/agence ni algorithme anti-répétition n’est implémenté aujourd’hui.

professionalCompositionManifest valide le document v2 et la configuration, puis retourne grammarVersion, recipeRelease, designVersion, seed, composition et fingerprint. Le manifeste est sérialisable et ne modifie pas le document. La seed est fournie par l’appelant; aucune randomisation, stockage ou recomposition automatique n’est exécuté. Pour une reproduction exacte future, conserver aussi le Design/version immutable choisi, les références privées d’assets et la version du moteur; la seed seule ne remplace pas ce snapshot.

Contrat futur du composer : recevoir type d’événement, cérémonies, contenu, photos/orientation, style, couleurs, ambiance, densité de texte et contraintes; filtrer la compatibilité, scorer l’adéquation, favoriser la diversité, exclure les répétitions, construire les candidats puis valider chacun avec le moteur graphique (overflow, safe margins, DPI, QR). Présenter seulement les candidats valides. Le choix doit passer par les Design/versions existants et produire le même document pour tous les invités, avec leurs seuls bindings personnalisés. Ne jamais appeler un composer dans le rendu par invité.

DONE : contrats de grammaire/empreinte/manifeste et backgroundTreatment; tests ciblés de déterminisme, diversité des recettes, incompatibilités, seed et validation v2. NOT IMPLEMENTED (hors périmètre demandé) : composer IA, scoring, randomisation, historique anti-répétition client/agence et persistence automatique du manifeste. Aucun nouvel écran, template, API, migration ou service.

## Phase 5 — déclaration éditoriale

Les nouvelles recettes déclarent explicitement le seul binding libre actuel event.invitationText dans metadata.editorialFields, avec AI_ASSIST_ALLOWED sur invitation. Les anciens Designs ne sont pas réécrits. Une publication de nouvelle version conserve les versions immuables précédentes. Le rendu partagé applique les textes sélectionnés depuis metadata.editorialOverrides, sans modifier les slots, masks, géométrie, règles photo ou bindings structurés. Voir AI_EDITORIAL_ASSIST.md pour les contrôles, versions et limites.
