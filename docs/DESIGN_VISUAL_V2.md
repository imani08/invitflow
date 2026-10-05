# Moteur visuel v2 — Phase 3

## Contrat

IMAGE conserve son type et son assetId privé. Son rôle facultatif est BACKGROUND, FOREGROUND, PHOTO, TEXTURE ou DECORATION. Un asset peut être réutilisé plusieurs fois. Le rôle ne modifie jamais le zIndex : l'ordre du document fait autorité.

Les bounds, cover/contain, cropX/Y (0–100), cropScale (1–3), rotation (−360–360), opacity (0–1), originalAssetId et derivedAssetId sont conservés. Extensions :

- focalPoint `{ x, y }` : coordonnées 0–1. En cover, le sujet est centré lorsque possible puis la translation est bornée pour ne pas laisser de trou. Le point focal remplace cropX/Y; sa désactivation rétablit ces valeurs. En contain, une dimension plus petite que le cadre reste centrée.
- maskId : identifiant du catalogue fermé ci-dessous.
- blur : de 0 à 24 pixels logiques, avant clipping/masking.
- overlay : voile uni ou dégradé, peint après l'image à l'intérieur du masque. Ce voile peut peindre les zones transparentes du média; ce n'est pas un détourage.

```json
{"type":"solid","color":"#32163A","opacity":0.25}
```

```json
{"type":"linear-gradient","angle":90,"opacity":0.5,"stops":[{"offset":0,"color":"#FFFFFF00"},{"offset":1,"color":"#FFFFFF"}]}
```

Couleurs RGB/RGBA hexadécimales uniquement, 2–6 stops ordonnés de 0 à 1, angle 0–360. Aucun SVG, URL, CSS arbitraire ou mode de fusion fourni par l'utilisateur.

## Catalogue initial immutable

| Identifiant, version 1 | Rendu |
| --- | --- |
| none | Rectangle |
| rounded-soft | Arrondi contrôlé |
| organic-portrait-01 | Courbes organiques internes |
| watercolor-soft-01 | Silhouette irrégulière et bord alpha adouci déterministe |
| brush-edge-01 | Contour brush irrégulier |

Chaque identifiant désigne définitivement sa géométrie v1; une évolution doit recevoir un nouvel identifiant pour préserver les snapshots. Ces masques constituent un moteur initial, pas un catalogue de templates artistiques finis. Aucune turbulence aléatoire ou image externe.

## Rendu, qualité et sécurité

Web et PDF v2 consomment exactement le même sérialiseur SVG. Le Web ajoute des zones interactives et un placeholder QR exclus du PDF. Les textures/décorations sont des IMAGE privés; aucun asset de production dans public. Seuls les blobs d'aperçu et les data URI PNG/WebP des médias contrôlés sont rendus. Le resolver ne fetch rien. Les fixtures synthétiques ne sont jamais seedées ou exposées en production.

Les backgrounds, textures et décorations peuvent traverser la safe area tout en restant dans le canevas. Textes et QR v2 respectent la safe area. Une image peinte après un texte/QR et recouvrant son cadre est signalée; les images derrière le contenu sont autorisées. Ce contrôle reste conservateur et ne mesure pas le contraste photographique ni les pixels alpha. La lisibilité des photos reste à contrôler visuellement.

La qualité est calculée après crop/zoom pour le target physique A5 par défaut (148 × 210 mm avec conservation des proportions) : moins de 72 DPI = ERROR; 72–149 = WARNING; à partir de 150 = OK. Une résolution inconnue est signalée. Le target web ne bloque pas sur la résolution impression.

Invitations vérifie les dimensions réelles des headers PNG/VP8/VP8L/VP8X avant réservation. Un v2 dont les dimensions déclarées ne correspondent pas est refusé avec IMAGE_DIMENSIONS_MISMATCH. Ce lecteur ne décode pas l'image : Media reste responsable de valider/converter les uploads. V1 conserve son renderer et ses règles historiques; aucune migration.

## Media et cycle de vie

Les références assetId/originalAssetId/derivedAssetId/assets[].assetId restent couvertes par les checks existants de Designs, versions, templates et versions templates. Invitations garde les médias immuables du batch et leurs références. Aucun nettoyage ou effacement nouveau. Un dérivé rembg existant peut servir de foreground; le rendu ne relance pas rembg. Aucune bibliothèque décorative de production n'est publiée.

## Validation du 5 octobre 2026

31/31 tests partagés, 5/5 Designs, 9/9 Invitations, 6/6 Web ciblés. Typechecks du package (déclarations), Web, Designs et Invitations réussis. ESLint ciblé réussi.

Chrome 154.0.8037.93 Windows a rendu 15 compositions : fixtures A–J et cinq masks. Captures Web et PDF A5 de 1 page, PNG alpha et WebP lossless alpha réellement décodés, gradients, blur et superpositions exercés. Une planche comparative a été inspectée. Poppler 96 DPI et captures 560 × 794 : erreur moyenne maximale 0,818/255; maximum de pixels avec un écart de canal >24 : 0,574 %. Seuils du comparateur : moyenne ≤2, proportion ≤1 %. Les changements de silhouettes et d'ordre I/J sont vérifiés. Ce sont des fixtures synthétiques, pas les JPG du client.

Sorties QA : `%TEMP%\invitaflow-visual-phase3`, incluant runtime-report.json, pixel-report.json, comparison-sheet.png, captures et PDF. Aucun de ces fichiers n'est un asset de production.

NOT TESTED : Chromium Linux du worker Docker, vrai parcours OIDC/Media/MinIO/batch, UI privée mobile et cycle de conservation en base. Docker répond permission denied sur son named pipe. Chrome et tsx ont été lancés hors sandbox après spawn EPERM.

## Reproduire avec les runtimes déjà installés

Depuis `D:\invitflow\invitaflow` :

```powershell
node --test --test-isolation=none packages/design-document/test/*.spec.mjs
node --test --test-isolation=none services/invitations/src/*.spec.mjs
node scripts/validate-design-visual.mjs '--modules=C:\Users\imani\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules' '--browser=C:\Program Files\Google\Chrome\Application\chrome.exe'
$qaDir = Join-Path $env:TEMP 'invitaflow-visual-phase3'
$qaPoppler = 'C:\Users\imani\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'
$env:PATH = "$qaPoppler;$env:PATH"
Get-ChildItem -LiteralPath $qaDir -Filter '*.pdf' | ForEach-Object {
  & "$qaPoppler\pdftoppm.exe" -png -r 96 -singlefile $_.FullName (Join-Path $qaDir ($_.BaseName + '-pdf'))
}
& 'C:\Users\imani\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/compare-design-visual.py $qaDir
```

Le flag facultatif `--alpha-webp=<fichier WebP transparent local de test>` remplace l'asset de G pour tester WebP. Les chemins sont ceux vérifiés ici; ailleurs, fournir ses runtimes existants. Ces outils ne deviennent pas des dépendances du projet.
