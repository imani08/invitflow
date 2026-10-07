# Classification des données

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

| Classe | Exemples du schéma / système | Contrôle attendu présent ou nécessaire |
|---|---|---|
| Identifiants/secrets | mots de passe, tokens OIDC, clés HMAC, SMTP, clés MinIO, tokens fournisseur | Secret hors Git; ne jamais journaliser; rotation et moindre privilège |
| Personnel invité | noms, emails/téléphones si fournis, notes | owner scope, réponse publique minimisée, éviter logs |
| Opérationnel privé | designs, listes d’invités, plans de salle, snapshots d’invitation | bases isolées, authorization, stockage privé |
| Transactionnel | références, montants, monnaie, statut provider, ledger crédits | idempotence, audit, restrictions mutation; données financières protégées |
| Audit | événement et métadonnées filtrés | append-only, allowlist et rôle support |
| Public contrôlé | invitation publiée via token signé | minimisation; ne pas exposer champs contact/notes |

Cette classification est un repère d’ingénierie et ne remplace pas une analyse juridique formelle ou une politique de conservation validée.
