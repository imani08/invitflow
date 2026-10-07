# Dictionnaire de données Prisma

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow

Schémas source présents dans le dépôt. Les noms et champs sont extraits des fichiers Prisma versionnés; ils ne démontrent pas l’état d’une base déployée.

## access

Source: `services/access/prisma/schema.prisma`

### Enum `AgentStatus`

`ACTIVE`, `REVOKED`

### Enum `AccessScanOutcome`

`ACCEPTED`, `DUPLICATE`, `REJECTED`, `UNAVAILABLE`

### Model `CheckInAgent`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `access` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `agentSubject` | `String` @map(&quot;agent_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `access` | Oui — revue requise | Politique approuvée non trouvée |
| `status` | `AgentStatus` @default(ACTIVE) | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `ceremonies` | `AgentCeremonyGrant[]`  | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `scans` | `AccessScanAttempt[]`  | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |

### Model `AgentCeremonyGrant`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `agentId` | `String` @map(&quot;agent_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `access` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `ceremonyId` | `String` @map(&quot;ceremony_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `agent` | `CheckInAgent` @relation(fields: [agentId], references: [id], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |

### Model `AccessScanAttempt`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `access` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `ceremonyId` | `String` @map(&quot;ceremony_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `operatorSubject` | `String` @map(&quot;operator_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `access` | Oui — revue requise | Politique approuvée non trouvée |
| `agentId` | `String?` @map(&quot;agent_id&quot;) @db.Uuid | Non | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `deviceFingerprint` | `String?` @map(&quot;device_fingerprint&quot;) @db.Char(64) | Non | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `userAgent` | `String?` @map(&quot;user_agent&quot;) @db.VarChar(300) | Non | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `outcome` | `AccessScanOutcome`  | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `upstreamStatus` | `Int` @map(&quot;upstream_status&quot;) @db.SmallInt | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `agent` | `CheckInAgent?` @relation(fields: [agentId], references: [id], onDelete: SetNull) | Non | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |

### Model `OutboxMessage`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `aggregateId` | `String` @map(&quot;aggregate_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `payload` | `Json`  | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `publishedAt` | `DateTime?` @map(&quot;published_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `access` | À classer | Politique approuvée non trouvée |

## ai-design

Source: `services/ai-design/prisma/schema.prisma`

### Enum `AiDesignJobStatus`

`QUEUED`, `PROCESSING`, `PROPOSED`, `FAILED`, `CANCELLED`

### Model `AiDesignJob`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `ai-design` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `designId` | `String` @map(&quot;design_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `baseVersion` | `Int` @map(&quot;base_version&quot;) | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `prompt` | `String` @db.VarChar(2000) | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `sourceDocument` | `Json` @map(&quot;source_document&quot;) | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `proposal` | `Json?`  | Non | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `previewObjectKey` | `String?` @map(&quot;preview_object_key&quot;) @db.VarChar(500) | Non | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `summary` | `String?` @db.VarChar(1000) | Non | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `provider` | `String?` @db.VarChar(60) | Non | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `status` | `AiDesignJobStatus` @default(QUEUED) | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `attempt` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `deliveryAfter` | `DateTime` @default(now()) @map(&quot;delivery_after&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `startedAt` | `DateTime?` @map(&quot;started_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `completedAt` | `DateTime?` @map(&quot;completed_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `errorCode` | `String?` @map(&quot;error_code&quot;) @db.VarChar(80) | Non | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |

### Model `OutboxMessage`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `aggregateId` | `String` @map(&quot;aggregate_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `payload` | `Json`  | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `publishedAt` | `DateTime?` @map(&quot;published_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `ai-design` | À classer | Politique approuvée non trouvée |

## analytics

Source: `services/analytics/prisma/schema.prisma`

### Model `ProcessedEvent`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `eventId` | `String` @id @map(&quot;event_id&quot;) @db.VarChar(64) | Oui | Oui | Non documentée dans Prisma | `analytics` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `analytics` | À classer | Politique approuvée non trouvée |
| `occurredAt` | `DateTime` @map(&quot;occurred_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `analytics` | À classer | Politique approuvée non trouvée |
| `processedAt` | `DateTime` @default(now()) @map(&quot;processed_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `analytics` | À classer | Politique approuvée non trouvée |

### Model `DailyMetric`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `analytics` | À classer | Politique approuvée non trouvée |
| `day` | `DateTime` @db.Date | Oui | Non | Non documentée dans Prisma | `analytics` | À classer | Politique approuvée non trouvée |
| `metric` | `String` @db.VarChar(80) | Oui | Non | Non documentée dans Prisma | `analytics` | À classer | Politique approuvée non trouvée |
| `currency` | `String` @default(&quot;&quot;) @db.VarChar(10) | Oui | Non | Non documentée dans Prisma | `analytics` | À classer | Politique approuvée non trouvée |
| `count` | `BigInt` @default(0) | Oui | Non | Non documentée dans Prisma | `analytics` | À classer | Politique approuvée non trouvée |
| `valueMinor` | `BigInt` @default(0) @map(&quot;value_minor&quot;) | Oui | Non | Non documentée dans Prisma | `analytics` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `analytics` | À classer | Politique approuvée non trouvée |

## audit

Source: `services/audit/prisma/schema.prisma`

### Model `AuditEvent`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `sourceEventId` | `String` @unique @map(&quot;source_event_id&quot;) @db.VarChar(64) | Oui | Oui | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(120) | Oui | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `actorSubject` | `String?` @map(&quot;actor_subject&quot;) @db.VarChar(255) | Non | Non | Non documentée dans Prisma | `audit` | Oui — revue requise | Politique approuvée non trouvée |
| `resourceId` | `String?` @map(&quot;resource_id&quot;) @db.VarChar(255) | Non | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `occurredAt` | `DateTime` @map(&quot;occurred_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `receivedAt` | `DateTime` @default(now()) @map(&quot;received_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `metadata` | `Json`  | Oui | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |

### Enum `ModerationStatus`

`OPEN`, `IN_REVIEW`, `RESOLVED`, `DISMISSED`

### Model `ModerationReport`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `reporterSubject` | `String` @map(&quot;reporter_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `audit` | Oui — revue requise | Politique approuvée non trouvée |
| `idempotencyKey` | `String` @map(&quot;idempotency_key&quot;) @db.VarChar(200) | Oui | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `resourceType` | `String` @map(&quot;resource_type&quot;) @db.VarChar(20) | Oui | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `resourceId` | `String` @map(&quot;resource_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `reasonCode` | `String` @map(&quot;reason_code&quot;) @db.VarChar(40) | Oui | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `description` | `String` @db.VarChar(1000) | Oui | Non | Non documentée dans Prisma | `audit` | Oui — revue requise | Politique approuvée non trouvée |
| `status` | `ModerationStatus` @default(OPEN) | Oui | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `reviewedBy` | `String?` @map(&quot;reviewed_by&quot;) @db.VarChar(255) | Non | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `resolutionNote` | `String?` @map(&quot;resolution_note&quot;) @db.VarChar(500) | Non | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `audit` | À classer | Politique approuvée non trouvée |

## billing

Source: `services/billing/prisma/schema.prisma`

### Model `PriceSchedule`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `version` | `Int` @unique | Oui | Oui | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `effectiveAt` | `DateTime` @map(&quot;effective_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `createdBy` | `String` @map(&quot;created_by&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `changeReason` | `String` @map(&quot;change_reason&quot;) @db.VarChar(500) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `taxPolicyEnabled` | `Boolean` @default(false) @map(&quot;tax_policy_enabled&quot;) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `taxRuleCode` | `String?` @map(&quot;tax_rule_code&quot;) @db.VarChar(80) | Non | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `taxRateBps` | `Int` @default(0) @map(&quot;tax_rate_bps&quot;) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `idempotencyKey` | `String` @unique @map(&quot;idempotency_key&quot;) @db.VarChar(255) | Oui | Oui | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `packs` | `CreditPack[]`  | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `rules` | `PriceRule[]`  | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |

### Model `CreditPack`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `scheduleId` | `String` @map(&quot;schedule_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `key` | `String` @db.VarChar(60) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `name` | `String` @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `credits` | `Int`  | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `periodDays` | `Int?` @map(&quot;period_days&quot;) | Non | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `priceMinor` | `Int` @map(&quot;price_minor&quot;) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `currency` | `String` @db.Char(3) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `description` | `String` @default(&quot;&quot;) @db.VarChar(1000) | Oui | Non | Non documentée dans Prisma | `billing` | Oui — revue requise | Politique approuvée non trouvée |
| `segment` | `String` @default(&quot;INDIVIDUAL&quot;) @db.VarChar(30) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `displayOrder` | `Int` @default(0) @map(&quot;display_order&quot;) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `badge` | `String?` @db.VarChar(40) | Non | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `validFrom` | `DateTime?` @map(&quot;valid_from&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `validUntil` | `DateTime?` @map(&quot;valid_until&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `visible` | `Boolean` @default(true) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `schedule` | `PriceSchedule` @relation(fields: [scheduleId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |

### Model `PriceRule`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `scheduleId` | `String` @map(&quot;schedule_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `operation` | `String` @db.VarChar(120) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `creditCost` | `Int` @map(&quot;credit_cost&quot;) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `unit` | `String` @db.VarChar(60) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `schedule` | `PriceSchedule` @relation(fields: [scheduleId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |

### Model `OutboxMessage`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `aggregateId` | `String` @map(&quot;aggregate_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `payload` | `Json`  | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `publishedAt` | `DateTime?` @map(&quot;published_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `billing` | À classer | Politique approuvée non trouvée |

## designs

Source: `services/designs/prisma/schema.prisma`

### Enum `TemplateCategory`

`WEDDING`, `BIRTHDAY`, `GRADUATION`, `BAPTISM`, `BABY_SHOWER`, `GALA`, `CONFERENCE`

### Enum `DesignStatus`

`DRAFT`, `ARCHIVED`

### Model `DesignTemplate`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `slug` | `String` @unique @db.VarChar(100) | Oui | Oui | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `version` | `Int` @default(1) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `name` | `String` @db.VarChar(120) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `description` | `String` @db.VarChar(500) | Oui | Non | Non documentée dans Prisma | `designs` | Oui — revue requise | Politique approuvée non trouvée |
| `category` | `TemplateCategory`  | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `style` | `String` @db.VarChar(60) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `tags` | `String[]`  | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `preview` | `Json`  | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `document` | `Json`  | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `isActive` | `Boolean` @default(true) @map(&quot;is_active&quot;) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `designs` | `Design[]`  | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `versions` | `DesignTemplateVersion[]`  | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |

### Model `DesignTemplateVersion`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `templateId` | `String` @map(&quot;template_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `version` | `Int`  | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `ceremonyTypes` | `String[]` @map(&quot;ceremony_types&quot;) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `document` | `Json`  | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `template` | `DesignTemplate` @relation(fields: [templateId], references: [id], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |

### Model `Design`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `designs` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `templateId` | `String?` @map(&quot;template_id&quot;) @db.Uuid | Non | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `templateSlug` | `String?` @map(&quot;template_slug&quot;) @db.VarChar(100) | Non | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `name` | `String` @db.VarChar(120) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `status` | `DesignStatus` @default(DRAFT) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `version` | `Int` @default(1) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `document` | `Json`  | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `template` | `DesignTemplate?` @relation(fields: [templateId], references: [id], onDelete: SetNull) | Non | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `versions` | `DesignVersion[]`  | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |

### Model `DesignVersion`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `designId` | `String` @map(&quot;design_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `version` | `Int`  | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `document` | `Json`  | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `name` | `String` @db.VarChar(120) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `design` | `Design` @relation(fields: [designId], references: [id], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |

### Model `OutboxMessage`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `aggregateId` | `String` @map(&quot;aggregate_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `payload` | `Json`  | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `publishedAt` | `DateTime?` @map(&quot;published_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `designs` | À classer | Politique approuvée non trouvée |

## events

Source: `services/events/prisma/schema.prisma`

### Enum `EventStatus`

`DRAFT`, `PUBLISHED`, `CANCELLED`, `COMPLETED`

### Enum `CeremonyStatus`

`SCHEDULED`, `CANCELLED`, `COMPLETED`

### Enum `AgencyRole`

`OWNER`, `ADMIN`, `MEMBER`

### Enum `AgencyMemberStatus`

`ACTIVE`, `SUSPENDED`, `REMOVED`

### Enum `AgencyWorkspaceStatus`

`ACTIVE`, `SUSPENDED`

### Enum `AgencySubscriptionStatus`

`PENDING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED`

### Enum `AgencyQuotaReservationStatus`

`RESERVED`, `CONSUMED`, `RELEASED`

### Model `Event`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `name` | `String` @db.VarChar(120) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `description` | `String?` @db.VarChar(4000) | Non | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(40) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `status` | `EventStatus` @default(DRAFT) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `startAt` | `DateTime?` @map(&quot;start_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `endAt` | `DateTime?` @map(&quot;end_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `timezone` | `String` @default(&quot;Africa/Kinshasa&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `ceremonies` | `Ceremony[]`  | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `agencyWorkspaceId` | `String?` @map(&quot;agency_workspace_id&quot;) @db.Uuid | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `agencyWorkspace` | `AgencyWorkspace?` @relation(&quot;AgencyWorkspaceEvents&quot;, fields: [agencyWorkspaceId], references: [id], onDelete: SetNull) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `agencyUsageReservations` | `AgencyQuotaReservation[]`  | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `agencyClientEvents` | `AgencyClientEvent[]`  | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |

### Model `Ceremony`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `name` | `String` @db.VarChar(120) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `ceremonyType` | `String` @map(&quot;ceremony_type&quot;) @db.VarChar(40) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `description` | `String?` @db.VarChar(2000) | Non | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `location` | `String?` @db.VarChar(300) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `address` | `String?` @db.VarChar(500) | Non | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `latitude` | `Float?` @db.DoublePrecision | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `longitude` | `Float?` @db.DoublePrecision | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `instructions` | `String?` @db.VarChar(4000) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `dressCode` | `String?` @map(&quot;dress_code&quot;) @db.VarChar(200) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `notes` | `String?` @db.VarChar(2000) | Non | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `capacity` | `Int?`  | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `startAt` | `DateTime` @map(&quot;start_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `endAt` | `DateTime?` @map(&quot;end_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `timezone` | `String` @default(&quot;Africa/Kinshasa&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `status` | `CeremonyStatus` @default(SCHEDULED) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `event` | `Event` @relation(fields: [eventId], references: [id], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `programItems` | `CeremonyProgramItem[]`  | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |

### Model `CeremonyProgramItem`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `ceremonyId` | `String` @map(&quot;ceremony_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `position` | `Int`  | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `title` | `String` @db.VarChar(120) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `description` | `String?` @db.VarChar(1000) | Non | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `location` | `String?` @db.VarChar(300) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `startsAt` | `DateTime?` @map(&quot;starts_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `durationMinutes` | `Int?` @map(&quot;duration_minutes&quot;) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `ceremony` | `Ceremony` @relation(fields: [ceremonyId], references: [id], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |

### Model `OutboxMessage`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `aggregateId` | `String` @map(&quot;aggregate_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `payload` | `Json`  | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `publishedAt` | `DateTime?` @map(&quot;published_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |

### Model `AgencyWorkspace`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `name` | `String` @db.VarChar(120) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `status` | `AgencyWorkspaceStatus` @default(ACTIVE) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `memberships` | `AgencyMembership[]`  | Oui | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `auditEntries` | `AgencyAuditEntry[]`  | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `clients` | `AgencyClient[]`  | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `events` | `Event[]` @relation(&quot;AgencyWorkspaceEvents&quot;) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `subscriptions` | `AgencySubscription[]`  | Oui | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `usageReservations` | `AgencyQuotaReservation[]`  | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |

### Model `AgencyMembership`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `workspaceId` | `String` @map(&quot;workspace_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `subject` | `String` @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `role` | `AgencyRole` @default(MEMBER) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `status` | `AgencyMemberStatus` @default(ACTIVE) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `addedBy` | `String` @map(&quot;added_by&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `workspace` | `AgencyWorkspace` @relation(fields: [workspaceId], references: [id], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |

### Model `AgencyAuditEntry`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `workspaceId` | `String` @map(&quot;workspace_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `actorSubject` | `String` @map(&quot;actor_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `targetSubject` | `String?` @map(&quot;target_subject&quot;) @db.VarChar(255) | Non | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `action` | `String` @db.VarChar(80) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `before` | `Json?`  | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `after` | `Json?`  | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `workspace` | `AgencyWorkspace` @relation(fields: [workspaceId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |

### Model `AgencyClient`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `workspaceId` | `String` @map(&quot;workspace_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `name` | `String` @db.VarChar(120) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `email` | `String?` @db.VarChar(320) | Non | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `phone` | `String?` @db.VarChar(40) | Non | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `createdBy` | `String` @map(&quot;created_by&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `workspace` | `AgencyWorkspace` @relation(fields: [workspaceId], references: [id], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `events` | `AgencyClientEvent[]`  | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |

### Model `AgencyClientEvent`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `workspaceId` | `String` @map(&quot;workspace_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `clientId` | `String` @map(&quot;client_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `client` | `AgencyClient` @relation(fields: [clientId, workspaceId], references: [id, workspaceId], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `event` | `Event` @relation(fields: [eventId, workspaceId], references: [id, agencyWorkspaceId], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |

### Model `AgencySubscription`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `workspaceId` | `String` @map(&quot;workspace_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `planPackId` | `String` @map(&quot;plan_pack_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `planKey` | `String` @map(&quot;plan_key&quot;) @db.VarChar(60) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `planName` | `String` @map(&quot;plan_name&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `quotaCredits` | `Int` @map(&quot;quota_credits&quot;) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `priceMinor` | `Int` @map(&quot;price_minor&quot;) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `currency` | `String` @db.Char(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `priceScheduleId` | `String` @map(&quot;price_schedule_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `priceScheduleVersion` | `Int` @map(&quot;price_schedule_version&quot;) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `currentPlanVersion` | `Int` @default(1) @map(&quot;current_plan_version&quot;) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `periodDays` | `Int?` @map(&quot;period_days&quot;) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `renewalOfId` | `String?` @map(&quot;renewal_of_id&quot;) @db.Uuid | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `renewalOf` | `AgencySubscription?` @relation(&quot;AgencySubscriptionPeriods&quot;, fields: [renewalOfId], references: [id], onDelete: Restrict) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `renewedPeriods` | `AgencySubscription[]` @relation(&quot;AgencySubscriptionPeriods&quot;) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `status` | `AgencySubscriptionStatus` @default(PENDING) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `paymentOrderId` | `String?` @unique @map(&quot;payment_order_id&quot;) @db.Uuid | Non | Oui | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `paymentId` | `String?` @unique @map(&quot;payment_id&quot;) @db.Uuid | Non | Oui | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `billingPeriodStart` | `DateTime?` @map(&quot;billing_period_start&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `billingPeriodEnd` | `DateTime?` @map(&quot;billing_period_end&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `startsAt` | `DateTime?` @map(&quot;starts_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `endsAt` | `DateTime?` @map(&quot;ends_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `workspace` | `AgencyWorkspace` @relation(fields: [workspaceId], references: [id], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `quotaReservations` | `AgencyQuotaReservation[]`  | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |

### Model `AgencyQuotaReservation`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `subscriptionId` | `String?` @map(&quot;subscription_id&quot;) @db.Uuid | Non | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `workspaceId` | `String` @map(&quot;workspace_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `referenceKey` | `String` @unique @map(&quot;reference_key&quot;) @db.VarChar(255) | Oui | Oui | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `credits` | `Int`  | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `status` | `AgencyQuotaReservationStatus` @default(RESERVED) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `workspace` | `AgencyWorkspace` @relation(fields: [workspaceId], references: [id], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |
| `subscription` | `AgencySubscription?` @relation(fields: [subscriptionId], references: [id], onDelete: Restrict) | Non | Non | Non documentée dans Prisma | `events` | Oui — revue requise | Politique approuvée non trouvée |
| `event` | `Event` @relation(fields: [eventId, workspaceId], references: [id, agencyWorkspaceId], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `events` | À classer | Politique approuvée non trouvée |

## guests

Source: `services/guests/prisma/schema.prisma`

### Enum `GuestStatus`

`ACTIVE`, `ARCHIVED`

### Enum `ImportStatus`

`ANALYZED`, `MAPPED`, `COMPLETED`, `FAILED`

### Model `Guest`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `guests` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `groupId` | `String?` @map(&quot;group_id&quot;) @db.Uuid | Non | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `fullName` | `String` @map(&quot;full_name&quot;) @db.VarChar(160) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `email` | `String?` @db.VarChar(320) | Non | Non | Non documentée dans Prisma | `guests` | Oui — revue requise | Politique approuvée non trouvée |
| `phone` | `String?` @db.VarChar(40) | Non | Non | Non documentée dans Prisma | `guests` | Oui — revue requise | Politique approuvée non trouvée |
| `notes` | `String?` @db.VarChar(2000) | Non | Non | Non documentée dans Prisma | `guests` | Oui — revue requise | Politique approuvée non trouvée |
| `status` | `GuestStatus` @default(ACTIVE) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `deletedAt` | `DateTime?` @map(&quot;deleted_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `group` | `GuestGroup?` @relation(fields: [groupId], references: [id], onDelete: SetNull) | Non | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `access` | `GuestCeremonyAccess[]`  | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `companions` | `Companion[]`  | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |

### Model `GuestGroup`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `guests` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `name` | `String` @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `guests` | `Guest[]`  | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |

### Model `GuestCeremonyAccess`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `guestId` | `String` @map(&quot;guest_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `ceremonyId` | `String` @map(&quot;ceremony_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `isInvited` | `Boolean` @default(true) @map(&quot;is_invited&quot;) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `allowedCompanions` | `Int` @default(0) @map(&quot;allowed_companions&quot;) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `tableReference` | `String?` @map(&quot;table_reference&quot;) @db.VarChar(120) | Non | Non | Non documentée dans Prisma | `guests` | Oui — revue requise | Politique approuvée non trouvée |
| `zoneReference` | `String?` @map(&quot;zone_reference&quot;) @db.VarChar(120) | Non | Non | Non documentée dans Prisma | `guests` | Oui — revue requise | Politique approuvée non trouvée |
| `seatNumber` | `String?` @map(&quot;seat_number&quot;) @db.VarChar(40) | Non | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `category` | `String?` @db.VarChar(80) | Non | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `notes` | `String?` @db.VarChar(1000) | Non | Non | Non documentée dans Prisma | `guests` | Oui — revue requise | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `guest` | `Guest` @relation(fields: [guestId], references: [id], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |

### Model `Companion`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `guestId` | `String` @map(&quot;guest_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `fullName` | `String` @map(&quot;full_name&quot;) @db.VarChar(160) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `relationship` | `String?` @db.VarChar(80) | Non | Non | Non documentée dans Prisma | `guests` | Oui — revue requise | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `guest` | `Guest` @relation(fields: [guestId], references: [id], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |

### Model `ImportJob`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `guests` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `originalName` | `String` @map(&quot;original_name&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `fileType` | `String` @map(&quot;file_type&quot;) @db.VarChar(10) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `status` | `ImportStatus` @default(ANALYZED) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `columns` | `Json`  | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `sourceRows` | `Json` @map(&quot;source_rows&quot;) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `mapping` | `Json?`  | Non | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `ceremonyIds` | `Json?` @map(&quot;ceremony_ids&quot;) | Non | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `preview` | `Json?`  | Non | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `resultSummary` | `Json?` @map(&quot;result_summary&quot;) | Non | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |

### Model `OutboxMessage`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `aggregateId` | `String` @map(&quot;aggregate_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `payload` | `Json`  | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `publishedAt` | `DateTime?` @map(&quot;published_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `guests` | À classer | Politique approuvée non trouvée |

## invitations

Source: `services/invitations/prisma/schema.prisma`

### Enum `InvitationStatus`

`DRAFT`, `READY`, `GENERATION_PENDING`, `GENERATING`, `GENERATED`, `FAILED`, `REVOKED`

### Enum `BatchStatus`

`RESERVING`, `QUEUED`, `GENERATING`, `COMPLETED`, `PARTIAL`, `FAILED`, `CANCELLED`

### Enum `BatchItemStatus`

`QUEUED`, `GENERATING`, `GENERATED`, `FAILED`, `CANCELLED`

### Enum `RsvpStatus`

`ACCEPTED`, `DECLINED`

### Model `Invitation`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `invitations` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `guestId` | `String` @map(&quot;guest_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `status` | `InvitationStatus` @default(DRAFT) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `currentVersionId` | `String?` @map(&quot;current_version_id&quot;) @db.Uuid | Non | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `versions` | `InvitationVersion[]`  | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `items` | `BatchItem[]`  | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `rsvps` | `InvitationRsvp[]`  | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `checkIns` | `InvitationCheckIn[]`  | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |

### Model `InvitationVersion`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `invitationId` | `String` @map(&quot;invitation_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `version` | `Int`  | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `designId` | `String` @map(&quot;design_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `designVersion` | `Int` @map(&quot;design_version&quot;) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `snapshot` | `Json`  | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `invitation` | `Invitation` @relation(fields: [invitationId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |

### Model `InvitationBatch`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `invitations` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `designId` | `String` @map(&quot;design_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `designVersion` | `Int` @map(&quot;design_version&quot;) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `status` | `BatchStatus` @default(RESERVING) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `idempotencyKey` | `String` @map(&quot;idempotency_key&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `reservationReference` | `String` @unique @map(&quot;reservation_reference&quot;) @db.VarChar(255) | Oui | Oui | Non documentée dans Prisma | `invitations` | Oui — revue requise | Politique approuvée non trouvée |
| `agencyReservationReference` | `String?` @unique @map(&quot;agency_reservation_reference&quot;) @db.VarChar(255) | Non | Oui | Non documentée dans Prisma | `invitations` | Oui — revue requise | Politique approuvée non trouvée |
| `agencyWorkspaceId` | `String?` @map(&quot;agency_workspace_id&quot;) @db.Uuid | Non | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `agencyReservedCredits` | `Int` @default(0) @map(&quot;agency_reserved_credits&quot;) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `walletReservedCredits` | `Int` @default(0) @map(&quot;wallet_reserved_credits&quot;) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `reservationReleasePending` | `Boolean` @default(false) @map(&quot;reservation_release_pending&quot;) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `totalItems` | `Int` @map(&quot;total_items&quot;) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `completedItems` | `Int` @default(0) @map(&quot;completed_items&quot;) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `failedItems` | `Int` @default(0) @map(&quot;failed_items&quot;) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `zipExpiresAt` | `DateTime?` @map(&quot;zip_expires_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `invitations` | Oui — revue requise | Politique approuvée non trouvée |
| `zipDeletedAt` | `DateTime?` @map(&quot;zip_deleted_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `invitations` | Oui — revue requise | Politique approuvée non trouvée |
| `zipSizeBytes` | `BigInt?` @map(&quot;zip_size_bytes&quot;) | Non | Non | Non documentée dans Prisma | `invitations` | Oui — revue requise | Politique approuvée non trouvée |
| `zipCleanupAttempts` | `Int` @default(0) @map(&quot;zip_cleanup_attempts&quot;) | Oui | Non | Non documentée dans Prisma | `invitations` | Oui — revue requise | Politique approuvée non trouvée |
| `zipCleanupLastError` | `String?` @map(&quot;zip_cleanup_last_error&quot;) @db.VarChar(80) | Non | Non | Non documentée dans Prisma | `invitations` | Oui — revue requise | Politique approuvée non trouvée |
| `cancelledAt` | `DateTime?` @map(&quot;cancelled_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `items` | `BatchItem[]`  | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |

### Model `BatchItem`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `batchId` | `String` @map(&quot;batch_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `invitationId` | `String` @map(&quot;invitation_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `guestId` | `String` @map(&quot;guest_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `snapshot` | `Json`  | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `status` | `BatchItemStatus` @default(QUEUED) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `objectKey` | `String?` @map(&quot;object_key&quot;) @db.VarChar(512) | Non | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `sizeBytes` | `BigInt?` @map(&quot;size_bytes&quot;) | Non | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `errorCode` | `String?` @map(&quot;error_code&quot;) @db.VarChar(80) | Non | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `batch` | `InvitationBatch` @relation(fields: [batchId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `invitation` | `Invitation` @relation(fields: [invitationId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |

### Model `OutboxMessage`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `aggregateId` | `String` @map(&quot;aggregate_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `payload` | `Json`  | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `publishedAt` | `DateTime?` @map(&quot;published_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |

### Model `InvitationRsvp`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `invitationId` | `String` @map(&quot;invitation_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `ceremonyId` | `String` @map(&quot;ceremony_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `status` | `RsvpStatus`  | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `attendingCompanions` | `Int` @default(0) @map(&quot;attending_companions&quot;) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `respondedAt` | `DateTime` @default(now()) @map(&quot;responded_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `invitation` | `Invitation` @relation(fields: [invitationId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |

### Model `InvitationCheckIn`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `invitationId` | `String` @map(&quot;invitation_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `ceremonyId` | `String` @map(&quot;ceremony_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `checkedBy` | `String` @map(&quot;checked_by&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `companionCount` | `Int` @default(0) @map(&quot;companion_count&quot;) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `checkedAt` | `DateTime` @default(now()) @map(&quot;checked_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |
| `invitation` | `Invitation` @relation(fields: [invitationId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `invitations` | À classer | Politique approuvée non trouvée |

## media

Source: `services/media/prisma/schema.prisma`

### Enum `MediaAssetPurpose`

`PHOTO`, `LOGO`, `BACKGROUND`, `GENERATED`, `THUMBNAIL`

### Enum `MediaAssetStatus`

`UPLOADING`, `PROCESSING`, `QUARANTINED`, `READY`, `REJECTED`, `DELETING`, `DELETED`

### Enum `MediaTransformationStatus`

`PENDING`, `PROCESSING`, `READY`, `FAILED`

### Enum `MediaTransformationType`

`BACKGROUND_REMOVAL`

### Enum `MediaAssetCategory`

`ORIGINAL_MEDIA`, `DERIVED_MEDIA`, `PREVIEW`, `PDF_FINAL`, `ZIP_EXPORT`, `TEMP_RENDER`, `IMPORT_TEMP`, `FAILED_JOB_ARTIFACT`

### Model `MediaAsset`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `media` | Oui — revue requise | Politique approuvée non trouvée |
| `purpose` | `MediaAssetPurpose`  | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `category` | `MediaAssetCategory` @default(ORIGINAL_MEDIA) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `status` | `MediaAssetStatus` @default(UPLOADING) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `originalName` | `String` @map(&quot;original_name&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `declaredMimeType` | `String` @map(&quot;declared_mime_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `detectedMimeType` | `String?` @map(&quot;detected_mime_type&quot;) @db.VarChar(100) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `sizeBytes` | `Int` @map(&quot;size_bytes&quot;) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `previewSizeBytes` | `Int?` @map(&quot;preview_size_bytes&quot;) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `thumbnailSizeBytes` | `Int?` @map(&quot;thumbnail_size_bytes&quot;) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `width` | `Int?`  | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `height` | `Int?`  | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `sha256` | `String?` @db.Char(64) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `uploadKey` | `String?` @unique @map(&quot;upload_key&quot;) @db.VarChar(500) | Non | Oui | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `quarantineKey` | `String` @unique @map(&quot;quarantine_key&quot;) @db.VarChar(500) | Oui | Oui | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `objectKey` | `String?` @unique @map(&quot;object_key&quot;) @db.VarChar(500) | Non | Oui | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `intentExpiresAt` | `DateTime` @map(&quot;intent_expires_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `uploadExpiresAt` | `DateTime` @map(&quot;upload_expires_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `quarantineExpiresAt` | `DateTime?` @map(&quot;quarantine_expires_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `deletedAt` | `DateTime?` @map(&quot;deleted_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `sourceAssetId` | `String?` @map(&quot;source_asset_id&quot;) @db.Uuid | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `transformationType` | `MediaTransformationType?` @map(&quot;transformation_type&quot;) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `expiresAt` | `DateTime?` @map(&quot;expires_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `lastAccessedAt` | `DateTime?` @map(&quot;last_accessed_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `isPinned` | `Boolean` @default(false) @map(&quot;is_pinned&quot;) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `sourceAsset` | `MediaAsset?` @relation(&quot;MediaDerivation&quot;, fields: [sourceAssetId], references: [id], onDelete: Restrict) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `derivedAssets` | `MediaAsset[]` @relation(&quot;MediaDerivation&quot;) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `sourceJobs` | `MediaTransformationJob[]` @relation(&quot;JobSource&quot;) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `derivedJob` | `MediaTransformationJob?` @relation(&quot;JobDerived&quot;) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |

### Model `MediaTransformationJob`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `media` | Oui — revue requise | Politique approuvée non trouvée |
| `sourceAssetId` | `String` @map(&quot;source_asset_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `derivedAssetId` | `String` @unique @map(&quot;derived_asset_id&quot;) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `type` | `MediaTransformationType`  | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `status` | `MediaTransformationStatus` @default(PENDING) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `errorCode` | `String?` @map(&quot;error_code&quot;) @db.VarChar(80) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `sourceAsset` | `MediaAsset` @relation(&quot;JobSource&quot;, fields: [sourceAssetId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `derivedAsset` | `MediaAsset` @relation(&quot;JobDerived&quot;, fields: [derivedAssetId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |

### Model `OutboxMessage`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `aggregateId` | `String` @map(&quot;aggregate_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `payload` | `Json`  | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `publishedAt` | `DateTime?` @map(&quot;published_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |

### Model `MediaCleanupEntry`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `fileId` | `String` @map(&quot;file_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `category` | `MediaAssetCategory`  | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `sizeBytes` | `Int` @map(&quot;size_bytes&quot;) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `reason` | `String` @db.VarChar(80) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `jobId` | `String?` @map(&quot;job_id&quot;) @db.Uuid | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `status` | `String` @db.VarChar(24) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `deletedAt` | `DateTime?` @map(&quot;deleted_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |

### Model `StorageInventorySnapshot`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `status` | `String` @db.VarChar(24) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `startedAt` | `DateTime` @default(now()) @map(&quot;started_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `measuredAt` | `DateTime?` @map(&quot;measured_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `validUntil` | `DateTime?` @map(&quot;valid_until&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `totalBytes` | `BigInt?` @map(&quot;total_bytes&quot;) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `objectCount` | `BigInt?` @map(&quot;object_count&quot;) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `summary` | `Json?`  | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |
| `errorCode` | `String?` @map(&quot;error_code&quot;) @db.VarChar(80) | Non | Non | Non documentée dans Prisma | `media` | À classer | Politique approuvée non trouvée |

## notifications

Source: `services/notifications/prisma/schema.prisma`

### Model `Notification`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `notifications` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `notifications` | Oui — revue requise | Politique approuvée non trouvée |
| `sourceEventId` | `String` @unique @map(&quot;source_event_id&quot;) @db.VarChar(64) | Oui | Oui | Non documentée dans Prisma | `notifications` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `notifications` | À classer | Politique approuvée non trouvée |
| `category` | `String` @db.VarChar(40) | Oui | Non | Non documentée dans Prisma | `notifications` | À classer | Politique approuvée non trouvée |
| `title` | `String` @db.VarChar(160) | Oui | Non | Non documentée dans Prisma | `notifications` | À classer | Politique approuvée non trouvée |
| `message` | `String` @db.VarChar(500) | Oui | Non | Non documentée dans Prisma | `notifications` | À classer | Politique approuvée non trouvée |
| `data` | `Json`  | Oui | Non | Non documentée dans Prisma | `notifications` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `notifications` | À classer | Politique approuvée non trouvée |
| `readAt` | `DateTime?` @map(&quot;read_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `notifications` | À classer | Politique approuvée non trouvée |

### Model `NotificationPreference`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `ownerSubject` | `String` @id @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Oui | Non documentée dans Prisma | `notifications` | Oui — revue requise | Politique approuvée non trouvée |
| `enabled` | `Boolean` @default(true) | Oui | Non | Non documentée dans Prisma | `notifications` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `notifications` | À classer | Politique approuvée non trouvée |

## payments

Source: `services/payments/prisma/schema.prisma`

### Enum `PaymentStatus`

`CREATED`, `PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `EXPIRED`, `REFUND_PENDING`, `REFUNDED`

### Enum `OrderStatus`

`CREATED`, `PAID`, `CANCELLED`, `REFUNDED`

### Enum `PaymentOrderType`

`CREDIT_PURCHASE`, `AGENCY_SUBSCRIPTION`

### Enum `PartnerStatus`

`PENDING`, `ACTIVE`, `SUSPENDED`

### Enum `PartnerAttributionStatus`

`ACTIVE`, `REVOKED`

### Enum `CommissionLedgerStatus`

`PENDING`, `VALIDATED`, `PAYABLE`, `PAID`, `REVERSED`, `DISPUTED`

### Enum `PartnerPayoutStatus`

`PENDING`, `APPROVED`, `PROCESSING`, `PAID`, `REJECTED`

### Model `PaymentOrder`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `orderType` | `PaymentOrderType` @default(CREDIT_PURCHASE) @map(&quot;order_type&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `businessReference` | `String?` @map(&quot;business_reference&quot;) @db.VarChar(255) | Non | Non | Non documentée dans Prisma | `payments` | Oui — revue requise | Politique approuvée non trouvée |
| `metadata` | `Json?` @db.JsonB | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `payments` | Oui — revue requise | Politique approuvée non trouvée |
| `packId` | `String` @map(&quot;pack_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `packKey` | `String` @map(&quot;pack_key&quot;) @db.VarChar(60) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `packName` | `String` @map(&quot;pack_name&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `credits` | `Int`  | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `unitCredits` | `Int` @map(&quot;unit_credits&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `quantity` | `Int` @default(1) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `unitPriceMinor` | `Int` @map(&quot;unit_price_minor&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `discountMinor` | `Int` @default(0) @map(&quot;discount_minor&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `discountRule` | `String?` @map(&quot;discount_rule&quot;) @db.VarChar(120) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `taxEnabled` | `Boolean` @default(false) @map(&quot;tax_enabled&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `taxRule` | `String?` @map(&quot;tax_rule&quot;) @db.VarChar(80) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `taxRateBps` | `Int` @default(0) @map(&quot;tax_rate_bps&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `taxMinor` | `Int` @default(0) @map(&quot;tax_minor&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `subtotalMinor` | `Int` @map(&quot;subtotal_minor&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `totalMinor` | `Int` @map(&quot;total_minor&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `amountMinor` | `Int` @map(&quot;amount_minor&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `currency` | `String` @db.Char(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `priceScheduleId` | `String` @map(&quot;price_schedule_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `priceScheduleVersion` | `Int` @map(&quot;price_schedule_version&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `idempotencyKey` | `String` @map(&quot;idempotency_key&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `salesTermsVersion` | `String?` @map(&quot;sales_terms_version&quot;) @db.VarChar(20) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `refundPolicyVersion` | `String?` @map(&quot;refund_policy_version&quot;) @db.VarChar(20) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `salesTermsAcceptedAt` | `DateTime?` @map(&quot;sales_terms_accepted_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `refundPolicyAcceptedAt` | `DateTime?` @map(&quot;refund_policy_accepted_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `status` | `OrderStatus` @default(CREATED) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `payment` | `Payment?`  | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `commissionLedgerEntries` | `CommissionLedgerEntry[]`  | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |

### Model `Payment`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `orderId` | `String` @unique @map(&quot;order_id&quot;) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `provider` | `String` @db.VarChar(40) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `status` | `PaymentStatus` @default(CREATED) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `checkoutUrl` | `String?` @map(&quot;checkout_url&quot;) @db.VarChar(2048) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `providerOrderRef` | `String?` @map(&quot;provider_order_ref&quot;) @db.VarChar(16) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `providerStatus` | `String?` @map(&quot;provider_status&quot;) @db.VarChar(80) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `providerTransactionId` | `String?` @unique @map(&quot;provider_transaction_id&quot;) @db.VarChar(255) | Non | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `providerReference` | `String?` @map(&quot;provider_reference&quot;) @db.VarChar(255) | Non | Non | Non documentée dans Prisma | `payments` | Oui — revue requise | Politique approuvée non trouvée |
| `providerRefundId` | `String?` @map(&quot;provider_refund_id&quot;) @db.VarChar(255) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `failureCode` | `String?` @map(&quot;failure_code&quot;) @db.VarChar(100) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `paidAt` | `DateTime?` @map(&quot;paid_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `reconciliationAttemptAt` | `DateTime?` @map(&quot;reconciliation_attempt_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `order` | `PaymentOrder` @relation(fields: [orderId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `reconciliationIssues` | `PaymentReconciliationIssue[]`  | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `commissionLedgerEntries` | `CommissionLedgerEntry[]`  | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |

### Model `Partner`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String?` @unique @map(&quot;owner_subject&quot;) @db.VarChar(255) | Non | Oui | Non documentée dans Prisma | `payments` | Oui — revue requise | Politique approuvée non trouvée |
| `code` | `String` @unique @db.VarChar(60) | Oui | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `status` | `PartnerStatus` @default(PENDING) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `commissionRateBps` | `Int` @map(&quot;commission_rate_bps&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `eligibleOrderTypes` | `PaymentOrderType[]` @default([]) @map(&quot;eligible_order_types&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `attributions` | `ReferralAttribution[]`  | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `ledgerEntries` | `CommissionLedgerEntry[]`  | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `payouts` | `PartnerPayout[]`  | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `auditEntries` | `PartnerAuditEntry[]`  | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |

### Model `ReferralAttribution`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `partnerId` | `String` @map(&quot;partner_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `customerSubject` | `String` @unique @map(&quot;customer_subject&quot;) @db.VarChar(255) | Oui | Oui | Non documentée dans Prisma | `payments` | Oui — revue requise | Politique approuvée non trouvée |
| `source` | `String` @db.VarChar(20) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `codeSnapshot` | `String` @map(&quot;code_snapshot&quot;) @db.VarChar(60) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `status` | `PartnerAttributionStatus` @default(ACTIVE) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `attributedAt` | `DateTime` @default(now()) @map(&quot;attributed_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `partner` | `Partner` @relation(fields: [partnerId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `ledgerEntries` | `CommissionLedgerEntry[]`  | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |

### Model `CommissionLedgerEntry`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `partnerId` | `String` @map(&quot;partner_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `attributionId` | `String?` @map(&quot;attribution_id&quot;) @db.Uuid | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `paymentId` | `String` @map(&quot;payment_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `originalPaymentId` | `String?` @unique @map(&quot;original_payment_id&quot;) @db.Uuid | Non | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `orderId` | `String` @map(&quot;order_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `originalEntryId` | `String?` @unique @map(&quot;original_entry_id&quot;) @db.Uuid | Non | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `status` | `CommissionLedgerStatus` @default(PENDING) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `orderType` | `PaymentOrderType` @map(&quot;order_type&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `baseAmountMinor` | `Int` @map(&quot;base_amount_minor&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `commissionAmountMinor` | `Int` @map(&quot;commission_amount_minor&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `rateBpsSnapshot` | `Int` @map(&quot;rate_bps_snapshot&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `currency` | `String` @db.Char(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `partner` | `Partner` @relation(fields: [partnerId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `attribution` | `ReferralAttribution?` @relation(fields: [attributionId], references: [id], onDelete: Restrict) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `payment` | `Payment` @relation(fields: [paymentId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `order` | `PaymentOrder` @relation(fields: [orderId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `originalEntry` | `CommissionLedgerEntry?` @relation(&quot;CommissionReversal&quot;, fields: [originalEntryId], references: [id], onDelete: Restrict) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `reversal` | `CommissionLedgerEntry?` @relation(&quot;CommissionReversal&quot;) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `payoutLinks` | `PartnerPayoutCommission[]`  | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |

### Model `PartnerPayout`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `partnerId` | `String` @map(&quot;partner_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `amountMinor` | `Int` @map(&quot;amount_minor&quot;) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `currency` | `String` @db.Char(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `status` | `PartnerPayoutStatus` @default(PENDING) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `externalReference` | `String?` @map(&quot;external_reference&quot;) @db.VarChar(255) | Non | Non | Non documentée dans Prisma | `payments` | Oui — revue requise | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `partner` | `Partner` @relation(fields: [partnerId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `commissions` | `PartnerPayoutCommission[]`  | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |

### Model `PartnerPayoutCommission`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `payoutId` | `String` @map(&quot;payout_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `commissionEntryId` | `String` @map(&quot;commission_entry_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `payout` | `PartnerPayout` @relation(fields: [payoutId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `commissionEntry` | `CommissionLedgerEntry` @relation(fields: [commissionEntryId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |

### Model `PartnerAuditEntry`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `partnerId` | `String` @map(&quot;partner_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `actorSubject` | `String` @map(&quot;actor_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `payments` | Oui — revue requise | Politique approuvée non trouvée |
| `action` | `String` @db.VarChar(80) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `before` | `Json?`  | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `after` | `Json?`  | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `partner` | `Partner` @relation(fields: [partnerId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |

### Model `WebhookReceipt`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `provider` | `String` @db.VarChar(40) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `eventHash` | `String` @map(&quot;event_hash&quot;) @db.Char(64) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `receivedAt` | `DateTime` @default(now()) @map(&quot;received_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |

### Model `PaymentReconciliationIssue`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `paymentId` | `String` @map(&quot;payment_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `fingerprint` | `String` @unique @db.Char(64) | Oui | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `internalStatus` | `String` @map(&quot;internal_status&quot;) @db.VarChar(40) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `providerStatus` | `String` @map(&quot;provider_status&quot;) @db.VarChar(80) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `firstSeenAt` | `DateTime` @default(now()) @map(&quot;first_seen_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `lastSeenAt` | `DateTime` @default(now()) @map(&quot;last_seen_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `occurrences` | `Int` @default(1) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `resolvedAt` | `DateTime?` @map(&quot;resolved_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `payment` | `Payment` @relation(fields: [paymentId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |

### Model `OutboxMessage`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `aggregateId` | `String` @map(&quot;aggregate_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `payload` | `Json`  | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `publishedAt` | `DateTime?` @map(&quot;published_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `payments` | À classer | Politique approuvée non trouvée |

## profile

Source: `services/profile/prisma/schema.prisma`

### Model `Profile`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `identitySubject` | `String` @unique(map: &quot;profiles_identity_subject_key&quot;) @map(&quot;identity_subject&quot;) @db.VarChar(255) | Oui | Oui | Non documentée dans Prisma | `profile` | Oui — revue requise | Politique approuvée non trouvée |
| `email` | `String?` @db.VarChar(320) | Non | Non | Non documentée dans Prisma | `profile` | Oui — revue requise | Politique approuvée non trouvée |
| `displayName` | `String?` @map(&quot;display_name&quot;) @db.VarChar(100) | Non | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `locale` | `String` @default(&quot;fr&quot;) @db.VarChar(5) | Oui | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |

### Enum `DeletionRequestStatus`

`PENDING`, `CANCELLED`, `COMPLETED`

### Model `AccountDeletionRequest`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `identitySubject` | `String` @map(&quot;identity_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `profile` | Oui — revue requise | Politique approuvée non trouvée |
| `status` | `DeletionRequestStatus` @default(PENDING) | Oui | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `requestedAt` | `DateTime` @default(now()) @map(&quot;requested_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `cancelledAt` | `DateTime?` @map(&quot;cancelled_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `completedAt` | `DateTime?` @map(&quot;completed_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |

### Model `OutboxMessage`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `aggregateId` | `String` @map(&quot;aggregate_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `payload` | `Json`  | Oui | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `publishedAt` | `DateTime?` @map(&quot;published_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `profile` | À classer | Politique approuvée non trouvée |

## seating

Source: `services/seating/prisma/schema.prisma`

### Enum `SeatingMode`

`NO_SEATING`, `TABLE`, `ZONE`

### Enum `SeatingImportStatus`

`ANALYZED`, `COMPLETED`

### Model `SeatingPlan`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `seating` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `ceremonyId` | `String` @unique @map(&quot;ceremony_id&quot;) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `mode` | `SeatingMode` @default(NO_SEATING) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `tables` | `SeatingTable[]`  | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `zones` | `SeatingZone[]`  | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `assignments` | `SeatingAssignment[]`  | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |

### Model `SeatingTable`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `seating` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `ceremonyId` | `String` @map(&quot;ceremony_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `name` | `String` @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `number` | `Int?`  | Non | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `capacity` | `Int` @db.SmallInt | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `category` | `String?` @db.VarChar(80) | Non | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `notes` | `String?` @db.VarChar(1000) | Non | Non | Non documentée dans Prisma | `seating` | Oui — revue requise | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `plan` | `SeatingPlan` @relation(fields: [ceremonyId], references: [ceremonyId], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `assignments` | `SeatingAssignment[]`  | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |

### Model `SeatingZone`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `seating` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `ceremonyId` | `String` @map(&quot;ceremony_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `name` | `String` @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `capacity` | `Int?` @db.SmallInt | Non | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `category` | `String?` @db.VarChar(80) | Non | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `notes` | `String?` @db.VarChar(1000) | Non | Non | Non documentée dans Prisma | `seating` | Oui — revue requise | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `plan` | `SeatingPlan` @relation(fields: [ceremonyId], references: [ceremonyId], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `assignments` | `SeatingAssignment[]`  | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |

### Model `SeatingAssignment`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `seating` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `ceremonyId` | `String` @map(&quot;ceremony_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `guestId` | `String` @map(&quot;guest_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `tableId` | `String?` @map(&quot;table_id&quot;) @db.Uuid | Non | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `zoneId` | `String?` @map(&quot;zone_id&quot;) @db.Uuid | Non | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `seatsReserved` | `Int` @default(1) @map(&quot;seats_reserved&quot;) @db.SmallInt | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `plan` | `SeatingPlan` @relation(fields: [ceremonyId], references: [ceremonyId], onDelete: Cascade) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `table` | `SeatingTable?` @relation(fields: [tableId], references: [id], onDelete: Cascade) | Non | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `zone` | `SeatingZone?` @relation(fields: [zoneId], references: [id], onDelete: Cascade) | Non | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |

### Model `SeatingImportJob`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `seating` | Oui — revue requise | Politique approuvée non trouvée |
| `eventId` | `String` @map(&quot;event_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `ceremonyId` | `String` @map(&quot;ceremony_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `originalName` | `String` @map(&quot;original_name&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `status` | `SeatingImportStatus` @default(ANALYZED) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `sourceRows` | `Json` @map(&quot;source_rows&quot;) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `preview` | `Json`  | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `resultSummary` | `Json?` @map(&quot;result_summary&quot;) | Non | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |

### Model `OutboxMessage`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `aggregateId` | `String` @map(&quot;aggregate_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `payload` | `Json`  | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `publishedAt` | `DateTime?` @map(&quot;published_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `seating` | À classer | Politique approuvée non trouvée |

## wallet

Source: `services/wallet/prisma/schema.prisma`

### Enum `WalletEntryType`

`PURCHASE`, `PROMO`, `ADMIN_ADJUSTMENT`, `RESERVATION`, `CONSUMPTION`, `RELEASE`, `REVERSAL`, `SETTLEMENT`

### Enum `ReservationStatus`

`RESERVED`, `CONSUMED`, `RELEASED`

### Model `Wallet`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `ownerSubject` | `String` @unique @map(&quot;owner_subject&quot;) @db.VarChar(255) | Oui | Oui | Non documentée dans Prisma | `wallet` | Oui — revue requise | Politique approuvée non trouvée |
| `availableCredits` | `Int` @default(0) @map(&quot;available_credits&quot;) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `reservedCredits` | `Int` @default(0) @map(&quot;reserved_credits&quot;) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `updatedAt` | `DateTime` @updatedAt @map(&quot;updated_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `entries` | `WalletEntry[]`  | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `reservations` | `WalletReservation[]`  | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |

### Model `WalletEntry`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `walletId` | `String` @map(&quot;wallet_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `type` | `WalletEntryType`  | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `availableDelta` | `Int` @map(&quot;available_delta&quot;) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `reservedDelta` | `Int` @map(&quot;reserved_delta&quot;) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `referenceType` | `String?` @map(&quot;reference_type&quot;) @db.VarChar(80) | Non | Non | Non documentée dans Prisma | `wallet` | Oui — revue requise | Politique approuvée non trouvée |
| `referenceId` | `String?` @map(&quot;reference_id&quot;) @db.VarChar(255) | Non | Non | Non documentée dans Prisma | `wallet` | Oui — revue requise | Politique approuvée non trouvée |
| `idempotencyKey` | `String` @unique @map(&quot;idempotency_key&quot;) @db.VarChar(255) | Oui | Oui | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `reversalOfEntryId` | `String?` @unique @map(&quot;reversal_of_entry_id&quot;) @db.Uuid | Non | Oui | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `metadata` | `Json?`  | Non | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `wallet` | `Wallet` @relation(fields: [walletId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `reversalOf` | `WalletEntry?` @relation(&quot;WalletEntryReversal&quot;, fields: [reversalOfEntryId], references: [id], onDelete: Restrict) | Non | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `reversals` | `WalletEntry[]` @relation(&quot;WalletEntryReversal&quot;) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |

### Model `WalletReservation`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `walletId` | `String` @map(&quot;wallet_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `referenceId` | `String` @map(&quot;reference_id&quot;) @db.VarChar(255) | Oui | Non | Non documentée dans Prisma | `wallet` | Oui — revue requise | Politique approuvée non trouvée |
| `credits` | `Int`  | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `status` | `ReservationStatus` @default(RESERVED) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `idempotencyKey` | `String` @unique @map(&quot;idempotency_key&quot;) @db.VarChar(255) | Oui | Oui | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `completedAt` | `DateTime?` @map(&quot;completed_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `wallet` | `Wallet` @relation(fields: [walletId], references: [id], onDelete: Restrict) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |

### Model `OutboxMessage`

| Champ | Type Prisma | Obligatoire | Unique | Description métier | Service propriétaire | Sensible ? | Rétention |
|---|---|---|---|---|---|---|---|
| `id` | `String` @id @default(uuid()) @db.Uuid | Oui | Oui | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `eventType` | `String` @map(&quot;event_type&quot;) @db.VarChar(100) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `aggregateId` | `String` @map(&quot;aggregate_id&quot;) @db.Uuid | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `payload` | `Json`  | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `createdAt` | `DateTime` @default(now()) @map(&quot;created_at&quot;) @db.Timestamptz(3) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `publishedAt` | `DateTime?` @map(&quot;published_at&quot;) @db.Timestamptz(3) | Non | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
| `attempts` | `Int` @default(0) | Oui | Non | Non documentée dans Prisma | `wallet` | À classer | Politique approuvée non trouvée |
