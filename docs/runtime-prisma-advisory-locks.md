# Correctif runtime Prisma — 12 octobre 2026

## Cause et correction

PostgreSQL `pg_advisory_xact_lock` retourne `void`. Prisma 7.10.0 avec PrismaPg refuse de désérialiser cette colonne via `$queryRaw` (P2010 / UnsupportedNativeDataType). Les quatre appels concernés utilisent désormais `$executeRaw`, sans changer le SQL, les paramètres, les transactions ou les clés de verrou :

- `AiDesignService.lockQuotaRows` : verrou global puis propriétaire ; création et reprise partagent ce helper.
- `InvitationService.createBatch` : verrou par événement.
- Publication des modèles Designs : verrou par slug.

Les autres `$queryRaw`, notamment les `SELECT id ... FOR UPDATE`, sont conservés.

## Vérification PostgreSQL réelle

Commande : `node scripts/check-postgres-advisory-locks.mjs`, Docker existant requis.

- P2010 original reproduit avec chacun des trois clients PrismaPg des conteneurs.
- SQL corrigé extrait des sources, exécuté réellement : trois contrôles réussis ; deux transactions concurrentes, une seule admission sur la capacité de test ; libération du verrou après rollback vérifiée.
- Méthode réelle `AiDesignService.create`, avec son verrou corrigé chargé des sources : deux créations concurrentes dans des tables PostgreSQL isolées, une admise et une rejetée avec 429. Seul DesignsClient est substitué par un document de test ; aucun worker ni appel GPT/FLUX.
- Méthodes réelles Wallet `reserve` et `settleReservation` : deux réservations concurrentes sur un crédit de test, une admise et une rejetée avec 409 ; répétitions de réservation/règlement sans double débit.
- Schémas aléatoires de test créés puis supprimés dans `finally`. Aucune table métier, aucun solde réel, aucune migration ni aucun volume modifié.

Limite : le test Invitations exécute le SQL de verrou réel, mais pas une génération complète avec Media/PDF et appels interservices. Les conteneurs existants ne sont pas reconstruits pendant cette passe ; les méthodes de service exécutées sont celles compilées dans les images, avec le helper SQL IA corrigé injecté depuis les sources.

Autres contrôles : six tests unitaires IA réussis ; typecheck AI Design, Invitations, Designs et Web réussi ; lint ciblé de ces fichiers réussi ; `git diff --check` réussi.

## Outbox Designs — cause séparée

L'accès depuis Designs à l'API management RabbitMQ `/api/exchanges/%2F/invitaflow.events` retourne **401** avec les credentials effectivement utilisés par l'éditeur d'outbox. Les valeurs configurées dans Designs et les valeurs `RABBITMQ_DEFAULT_*` du conteneur RabbitMQ sont identiques (comparaison en mémoire, valeurs jamais affichées).

Cela prouve un refus d'authentification RabbitMQ, indépendant de Prisma. Les variables de démarrage RabbitMQ ne prouvent pas que l'utilisateur persisté a encore ces credentials. La cause interne du refus (compte persisté, mot de passe ou accès management) reste à vérifier par l'opérateur. Aucun changement de credential, compte ou permissions n'a été effectué. **L'avertissement d'outbox reste donc non résolu par ce correctif SQL.** Aucun message de test publié sur le bus réel.

## Fichiers de cette passe

- `services/ai-design/src/ai-design.service.ts`
- `services/ai-design/src/ai-design-quota.spec.ts`
- `services/invitations/src/invitation.service.ts`
- `services/designs/src/publish-professional-templates.ts`
- `apps/web/src/app/events/[eventId]/designs/workspace.tsx` — libellé uniquement : « Améliorer avec notre IA (facultatif) ».
- `scripts/check-postgres-advisory-locks.mjs`
- `docs/runtime-prisma-advisory-locks.md`
- `apps/web/tsconfig.tsbuildinfo` — artefact actualisé par TypeScript.

## Application ciblée

```powershell
docker compose build ai-design invitations designs web
docker compose up -d --no-deps ai-design invitations designs web
```

Designs est inclus pour embarquer la correction du script de publication ; sa reconstruction ne résout pas le refus RabbitMQ. Aucune reconstruction de Wallet, PostgreSQL ou RabbitMQ nécessaire pour ce correctif. Aucun commit/push effectué.
