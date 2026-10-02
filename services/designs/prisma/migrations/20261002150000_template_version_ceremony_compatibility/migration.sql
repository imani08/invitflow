CREATE TABLE "design_template_versions" (
  "template_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "ceremony_types" TEXT[] NOT NULL,
  "document" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "design_template_versions_pkey" PRIMARY KEY ("template_id", "version"),
  CONSTRAINT "design_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "design_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "design_template_versions_positive_version_check" CHECK ("version" > 0),
  CONSTRAINT "design_template_versions_ceremony_types_check" CHECK (cardinality("ceremony_types") > 0 AND "ceremony_types" <@ ARRAY['CIVIL','RELIGIOUS','RECEPTION','DOT','TRADITIONAL','UNIVERSAL','CUSTOM']::TEXT[])
);
CREATE INDEX "design_template_versions_ceremony_types_idx" ON "design_template_versions" USING GIN ("ceremony_types");
INSERT INTO "design_template_versions" ("template_id", "version", "ceremony_types", "document")
SELECT "id", "version", ARRAY['UNIVERSAL']::TEXT[], "document" FROM "design_templates";

CREATE FUNCTION prevent_design_template_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Design template versions are immutable';
END;
$$;
CREATE TRIGGER design_template_versions_immutable
BEFORE UPDATE OR DELETE ON "design_template_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_design_template_version_mutation();
