# Politique de journalisation

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Gateway propage `x-request-id`, `x-correlation-id`; logs doivent aider le diagnostic sans bearer, cookie, mot de passe, SMTP secret, provider token, invitation URL/QR full token, email/téléphone ou texte libre d’invité. Audit event utilise allowlist de métadonnées et évite PII/free text selon README racine.

Uniformiser niveaux, champs timestamp/service/environment/errorCode, IDs corrélation et redaction. Définir rétention/accès/immutabilité du backend logs pour le déploiement; ces durées ne sont pas garanties dans le repo.
