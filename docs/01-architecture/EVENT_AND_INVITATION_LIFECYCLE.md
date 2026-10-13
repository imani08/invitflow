# Événement et invitations : cycles de vie

La génération d’un lot, son règlement, son téléchargement et son retéléchargement ne modifient jamais le statut métier de l’événement. Ils sont des opérations du domaine Invitations et restent consultables par le propriétaire autorisé.

Les textes principaux d’une invitation sont des données structurées de l’événement : `coupleNames` et `invitationText`. Pour préserver les événements existants, `description` reste une source de lecture de secours pour `invitationText`; toute nouvelle modification est stockée dans `invitationText`.

## Transitions explicites

| État courant | Action utilisateur confirmée | État suivant |
| --- | --- | --- |
| `DRAFT` | Publier | `PUBLISHED` |
| `DRAFT` ou `PUBLISHED` | Clôturer | `COMPLETED` |
| `COMPLETED` | Archiver | `ARCHIVED` |
| `ARCHIVED` | Restaurer | `COMPLETED` |

`CANCELLED` conserve sa règle existante. Aucune route de téléchargement ni aucun consommateur de lot n’est autorisé à effectuer ces transitions. L’archivage ne supprime ni fichiers, ni QR codes, ni journaux financiers, ni RSVP.

## Rendu

Le document v2 partage les lignes résolues entre l’aperçu et le SVG imprimé. Les retours volontaires créent des paragraphes distincts; le moteur ne découpe jamais un mot pour le faire tenir. Un texte trop grand reste entier et produit une erreur de dépassement exploitable par l’éditeur.
