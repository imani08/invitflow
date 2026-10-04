# DesignDocument v2 — fondations

## Portée

Le package partagé `@invitaflow/design-document` définit le contrat v2, son registre de polices contrôlé, sa liste blanche de bindings, la normalisation en mémoire des documents v1, les variantes par nombre de cérémonies, les règles de visibilité, la zone sûre et le résolveur déterministe des rendus. Les coordonnées restent des pixels logiques sur le canevas; `scaleLogicalBounds` les adapte au viewport sans muter le document.

Les bindings autorisés sont `guest.name`, `guest.email`, `guest.table`, `event.title`, `event.coupleNames`, `event.invitationText`, `event.date`, `event.venue`, `ceremonies`, `ceremony.*` (nom, date, heure, lieu, adresse, référence, dress code), `contact`, `qr` et `qr.url` (lien RSVP privé disponible). Les snapshots fournis sont projetés sur ces seuls champs avant résolution. Les champs optionnels vides et le QR absent sont omis. Les répétitions de cérémonie sont limitées aux éléments qui appartiennent explicitement au groupe `ceremonies`.

Une conversion v1 → v2 est calculée en mémoire et n’écrit aucune version ni ligne Prisma. Les anciens documents conservent leurs champs communs et leurs placeholders connus; les noms non reconnus ne deviennent pas des bindings exécutables. Les templates n’ont pas été modifiés ou publiés dans cette phase.

## Contrat de résolution

- Chaque document v2 définit une variante exacte `noCeremony` pour zéro, des variantes pour 1, 2 et 3 cérémonies, et une variante `gte 4`.
- Les règles de visibilité acceptent seulement `binding-exists` et `ceremony-count`.
- Les éléments texte ont une police du registre, une taille préférée/minimale et une politique explicite (`ERROR`, `SHRINK_WITH_LIMIT`, `USE_VARIANT`, `AI_ASSIST_ALLOWED`). Le résolveur mesure de façon déterministe, réduit jusqu’au minimum, puis signale un débordement; il ne réécrit pas le contenu.
- Les éléments essentiels hors de la zone sûre et tout élément hors canevas génèrent des erreurs; l’ordre est stable par z-index et ordre source.
- Les masques enregistrés mais sans moteur de rendu restent signalés comme non pris en charge.

## Intégrations

Designs normalise les anciens documents servis en v2 et valide les documents v2 avec les règles v2 plus les invariants communs existants. Invitations valide chaque invité via le résolveur avant réservation de crédits, puis stocke le layout résolu dans son snapshot immuable. Le worker consomme ce layout pour le PDF; les anciens snapshots sans layout gardent leur chemin de rendu antérieur. L’atelier Web utilise le même résolveur pour ses valeurs de preview sans remplacer ses API ni son éditeur.

## Fixtures et couverture ciblée

`test/fixtures/legacy-v1.json` couvre la compatibilité; `test/fixtures/portrait-two-ceremonies-v2.json` couvre canvas, variantes, groupe répété, table facultative et QR. Les tests ciblent validation v1/v2, bindings interdits, variantes de 0 à 4 cérémonies, champs optionnels, longs noms, safe area, ordre z, répétitions, déterminisme, isolation invité et mise à l’échelle.

## Hors portée

Aucune migration Prisma, modification Wallet/Billing/Payments, publication de templates, création d’assets visuels, masque aquarelle, résumé IA, éditeur majeur ou génération finale supplémentaire n’est incluse. Les profils de police sont des polices système; aucune police binaire n’est embarquée.
