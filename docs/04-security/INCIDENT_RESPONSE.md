# Procédure de réponse incident

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PLANNED**

## Séquence initiale

1. Déclarer incident, heure, service, environnement et coordinateur; éviter recopier PII/secrets dans tickets.
2. Évaluer risque immédiat : authentification compromise, fuite invités, accès objet, paiement/ledger, disponibilité.
3. Contenir via rotation/révocation ciblée des credentials/tokens, désactivation de clé/lien, isolation du service ou arrêt du worker selon périmètre; préserver journaux et DB.
4. Capturer request/correlation IDs, event IDs, références payment, commit/config version, fenêtre temps; conserver intégrité et accès restreint.
5. Récupérer depuis backup documenté seulement après validation de l’instantané et isolement de la cible; ne pas réécrire ledger/audit.
6. Vérifier santé, migrations, login, ownership, stockage, ledger/outbox et erreurs; communiquer selon obligations réglementaires et légales approuvées.
7. Rédiger cause, portée, données touchées, actions préventives et propriétaire.

Les contacts officiels produit sont `fucushd098@gmail.com`, `+243973431495`. Les astreintes, délais d’escalade, obligations de notification et RTO/RPO n’apparaissent pas définis dans le dépôt : les approuver avant production.
