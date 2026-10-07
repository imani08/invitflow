# Exigences non fonctionnelles

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **PARTIAL**

| ID | Exigence / contrôle constaté | Statut / limite |
|---|---|---|
| NFR-SEC-001 | OIDC code flow, PKCE S256, state/nonce et session BFF opaque chiffrée côté serveur | Code présent, parcours runtime non vérifié |
| NFR-SEC-002 | Services valident signature/issuer/audience/verified email et owner subject | Présent selon guards; couverture inter-utilisateur E2E requise |
| NFR-SEC-003 | Secrets en variables d’environnement/Compose; aucune valeur `.env` versionnée | `.env.example` contient placeholders; audit runtime/deployment requis |
| NFR-SEC-004 | Upload image borné, quarantine, vérification structure, ClamAV, transcodage Sharp | Code/tests unitaires présents; runtime requis |
| NFR-DATA-001 | Bases et identifiants PostgreSQL séparés par service | Compose/provisioning présent |
| NFR-DATA-002 | Migrations Prisma versionnées par service | Présentes; état dans DB inconnue |
| NFR-RES-001 | Outbox, retries, DLQ et reprises sont employés selon consommateurs | Implémentation non uniforme; vérifier catalogue événements |
| NFR-OBS-001 | Health endpoints, métriques Gateway, Prometheus/Grafana et exporters optionnels | Configuration présente; runtime non vérifié |
| NFR-PERF-001 | Limites de taille/dimension média, quotas de jobs IA et claims bornés | Valeurs code/config; aucun rapport de performance E2E actuel |
| NFR-AVAIL-001 | Aucun SLA/RTO/RPO approuvé détecté | À définir; propositions de reprise explicitement étiquetées |
| NFR-A11Y-001 | Styles et composants comprennent focus/thème; aucun audit exhaustif certifié | NOT VERIFIED |
| NFR-PRIV-001 | Données invités sensibles et journaux filtrés selon allowlist dans Audit | Contrôles code présents; durée de rétention juridique à approuver |

Les objectifs numériques de latence, disponibilité, capacité et rétention ne sont pas inventés : ils sont des éléments ouverts tant qu’une politique approuvée ne figure pas au dépôt.
