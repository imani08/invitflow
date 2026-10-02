ALTER TYPE "AgencyMemberStatus" ADD VALUE 'REMOVED';

CREATE TABLE "agency_audit_entries" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "actor_subject" VARCHAR(255) NOT NULL,
  "target_subject" VARCHAR(255),
  "action" VARCHAR(80) NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agency_audit_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agency_audit_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "agency_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "agency_audit_workspace_created_idx" ON "agency_audit_entries"("workspace_id", "created_at" DESC);
