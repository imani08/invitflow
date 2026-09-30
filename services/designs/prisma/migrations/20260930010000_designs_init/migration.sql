CREATE TYPE "TemplateCategory" AS ENUM ('WEDDING', 'BIRTHDAY', 'GRADUATION', 'BAPTISM', 'BABY_SHOWER', 'GALA', 'CONFERENCE');
CREATE TYPE "DesignStatus" AS ENUM ('DRAFT', 'ARCHIVED');

CREATE TABLE "design_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" VARCHAR(100) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "category" "TemplateCategory" NOT NULL,
  "style" VARCHAR(60) NOT NULL,
  "tags" TEXT[] NOT NULL,
  "preview" JSONB NOT NULL,
  "document" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "design_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "design_templates_slug_key" ON "design_templates"("slug");
CREATE INDEX "design_templates_catalog_idx" ON "design_templates"("category", "is_active", "name");

CREATE TABLE "designs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_subject" VARCHAR(255) NOT NULL,
  "event_id" UUID NOT NULL,
  "template_id" UUID,
  "template_slug" VARCHAR(100),
  "name" VARCHAR(120) NOT NULL,
  "status" "DesignStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "document" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "designs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "designs_owner_event_updated_idx" ON "designs"("owner_subject", "event_id", "updated_at" DESC);
ALTER TABLE "designs" ADD CONSTRAINT "designs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "design_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "design_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "design_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "document" JSONB NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "design_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "design_versions_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "design_versions_design_version_key" ON "design_versions"("design_id", "version");
CREATE INDEX "design_versions_design_created_idx" ON "design_versions"("design_id", "created_at" DESC);

CREATE TABLE "outbox_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_type" VARCHAR(100) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "designs_outbox_pending_idx" ON "outbox_messages"("published_at", "created_at");

INSERT INTO "design_templates" ("slug", "name", "description", "category", "style", "tags", "preview", "document", "updated_at") VALUES
('wedding-ivory-editorial', 'Ivory éditorial', 'Composition éditoriale sobre sur papier ivoire, avec cadre et typographie contrastée.', 'WEDDING', 'EDITORIAL_WHITE', ARRAY['mariage','ivoire','minimal','portrait'], '{"background":"#F7F1E7","accent":"#94775F","style":"EDITORIAL_WHITE"}', '{"schemaVersion":1,"metadata":{"templateSlug":"wedding-ivory-editorial","templateVersion":1,"category":"WEDDING","style":"EDITORIAL_WHITE"},"canvas":{"width":1080,"height":1920,"unit":"px"},"theme":{"category":"WEDDING","style":"EDITORIAL_WHITE","palette":["#F7F1E7","#94775F","#302D2A"],"tokens":{"primary":"#94775F","secondary":"#302D2A","background":"#F7F1E7","font":"Georgia"}},"assets":[],"variables":[{"key":"coupleNames","label":"Noms du couple","type":"TEXT","defaultValue":"Noms du couple","required":true},{"key":"eventDate","label":"Date","type":"TEXT","defaultValue":"Date à confirmer","required":false},{"key":"eventLocation","label":"Lieu","type":"TEXT","defaultValue":"Nom du lieu","required":false}],"constraints":{"safeMargin":64,"allowOverflow":false},"layouts":[{"id":"portrait","name":"Portrait","width":1080,"height":1920}],"ceremonyRules":[],"exportProfiles":[{"id":"MOBILE_PORTRAIT","width":1080,"height":1920,"unit":"px"}],"elements":[{"id":"ivory-background","type":"BACKGROUND","name":"Fond ivoire","x":0,"y":0,"width":1080,"height":1920,"rotation":0,"locked":true,"editable":false,"zIndex":0,"fill":"#F7F1E7"},{"id":"editorial-frame","type":"SHAPE","name":"Cadre éditorial","x":70,"y":70,"width":940,"height":1780,"rotation":0,"locked":true,"editable":false,"zIndex":1,"shape":"RECTANGLE","fill":"transparent","stroke":"#94775F","strokeWidth":2},{"id":"couple-names","type":"TEXT","name":"Noms du couple","x":120,"y":650,"width":840,"height":190,"rotation":0,"locked":false,"editable":true,"zIndex":2,"text":"{{coupleNames}}","fontFamily":"Georgia","fontSize":80,"fontWeight":400,"align":"center","color":"#302D2A"},{"id":"event-date","type":"TEXT","name":"Date","x":120,"y":885,"width":840,"height":90,"rotation":0,"locked":false,"editable":true,"zIndex":3,"text":"{{eventDate}}","fontFamily":"Georgia","fontSize":38,"fontWeight":400,"align":"center","color":"#94775F"},{"id":"event-location","type":"TEXT","name":"Lieu","x":120,"y":1050,"width":840,"height":110,"rotation":0,"locked":false,"editable":true,"zIndex":4,"text":"{{eventLocation}}","fontFamily":"Georgia","fontSize":32,"fontWeight":400,"align":"center","color":"#302D2A"}],"version":1}'::jsonb, CURRENT_TIMESTAMP),
('wedding-midnight-gold', 'Nuit & or', 'Invitation nocturne aux accents or doux et au titre centré.', 'WEDDING', 'MIDNIGHT_BLUE', ARRAY['mariage','nuit','or','luxe'], '{"background":"#14212B","accent":"#D4B477","style":"MIDNIGHT_BLUE"}', '{"schemaVersion":1,"metadata":{"templateSlug":"wedding-midnight-gold","templateVersion":1,"category":"WEDDING","style":"MIDNIGHT_BLUE"},"canvas":{"width":1080,"height":1920,"unit":"px"},"theme":{"category":"WEDDING","style":"MIDNIGHT_BLUE","palette":["#14212B","#D4B477","#F7F0E4"],"tokens":{"primary":"#D4B477","secondary":"#F7F0E4","background":"#14212B","font":"Georgia"}},"assets":[],"variables":[{"key":"coupleNames","label":"Noms du couple","type":"TEXT","defaultValue":"Noms du couple","required":true},{"key":"eventDate","label":"Date","type":"TEXT","defaultValue":"Date à confirmer","required":false},{"key":"eventLocation","label":"Lieu","type":"TEXT","defaultValue":"Nom du lieu","required":false}],"constraints":{"safeMargin":72,"allowOverflow":false},"layouts":[{"id":"portrait","name":"Portrait","width":1080,"height":1920}],"ceremonyRules":[],"exportProfiles":[{"id":"MOBILE_PORTRAIT","width":1080,"height":1920,"unit":"px"}],"elements":[{"id":"midnight-background","type":"BACKGROUND","name":"Fond nuit","x":0,"y":0,"width":1080,"height":1920,"rotation":0,"locked":true,"editable":false,"zIndex":0,"fill":"#14212B"},{"id":"gold-frame","type":"SHAPE","name":"Cadre or","x":72,"y":72,"width":936,"height":1776,"rotation":0,"locked":true,"editable":false,"zIndex":1,"shape":"RECTANGLE","fill":"transparent","stroke":"#D4B477","strokeWidth":3},{"id":"midnight-title","type":"TEXT","name":"Noms du couple","x":120,"y":655,"width":840,"height":200,"rotation":0,"locked":false,"editable":true,"zIndex":2,"text":"{{coupleNames}}","fontFamily":"Georgia","fontSize":78,"fontWeight":400,"align":"center","color":"#F7F0E4"},{"id":"midnight-date","type":"TEXT","name":"Date","x":120,"y":895,"width":840,"height":100,"rotation":0,"locked":false,"editable":true,"zIndex":3,"text":"{{eventDate}}","fontFamily":"Georgia","fontSize":36,"fontWeight":400,"align":"center","color":"#D4B477"},{"id":"midnight-location","type":"TEXT","name":"Lieu","x":120,"y":1060,"width":840,"height":110,"rotation":0,"locked":false,"editable":true,"zIndex":4,"text":"{{eventLocation}}","fontFamily":"Georgia","fontSize":30,"fontWeight":400,"align":"center","color":"#F7F0E4"}],"version":1}'::jsonb, CURRENT_TIMESTAMP),
('wedding-emerald-modern', 'Émeraude moderne', 'Cadre à double liseré et palette émeraude avec détails typographiques lumineux.', 'WEDDING', 'EMERALD', ARRAY['mariage','émeraude','moderne','vert'], '{"background":"#EDF1E8","accent":"#2E5D4A","style":"EMERALD"}', '{"schemaVersion":1,"metadata":{"templateSlug":"wedding-emerald-modern","templateVersion":1,"category":"WEDDING","style":"EMERALD"},"canvas":{"width":1080,"height":1920,"unit":"px"},"theme":{"category":"WEDDING","style":"EMERALD","palette":["#EDF1E8","#2E5D4A","#BC9A64"],"tokens":{"primary":"#2E5D4A","secondary":"#BC9A64","background":"#EDF1E8","font":"Georgia"}},"assets":[],"variables":[{"key":"coupleNames","label":"Noms du couple","type":"TEXT","defaultValue":"Noms du couple","required":true},{"key":"eventDate","label":"Date","type":"TEXT","defaultValue":"Date à confirmer","required":false},{"key":"eventLocation","label":"Lieu","type":"TEXT","defaultValue":"Nom du lieu","required":false}],"constraints":{"safeMargin":64,"allowOverflow":false},"layouts":[{"id":"portrait","name":"Portrait","width":1080,"height":1920}],"ceremonyRules":[],"exportProfiles":[{"id":"MOBILE_PORTRAIT","width":1080,"height":1920,"unit":"px"}],"elements":[{"id":"emerald-background","type":"BACKGROUND","name":"Fond sauge","x":0,"y":0,"width":1080,"height":1920,"rotation":0,"locked":true,"editable":false,"zIndex":0,"fill":"#EDF1E8"},{"id":"emerald-frame","type":"SHAPE","name":"Double cadre","x":68,"y":68,"width":944,"height":1784,"rotation":0,"locked":true,"editable":false,"zIndex":1,"shape":"RECTANGLE","fill":"transparent","stroke":"#2E5D4A","strokeWidth":4},{"id":"emerald-inner-frame","type":"SHAPE","name":"Liseré intérieur","x":88,"y":88,"width":904,"height":1744,"rotation":0,"locked":true,"editable":false,"zIndex":2,"shape":"RECTANGLE","fill":"transparent","stroke":"#BC9A64","strokeWidth":1},{"id":"emerald-title","type":"TEXT","name":"Noms du couple","x":120,"y":650,"width":840,"height":200,"rotation":0,"locked":false,"editable":true,"zIndex":3,"text":"{{coupleNames}}","fontFamily":"Georgia","fontSize":76,"fontWeight":400,"align":"center","color":"#2E5D4A"},{"id":"emerald-date","type":"TEXT","name":"Date","x":120,"y":895,"width":840,"height":100,"rotation":0,"locked":false,"editable":true,"zIndex":4,"text":"{{eventDate}}","fontFamily":"Georgia","fontSize":36,"fontWeight":400,"align":"center","color":"#BC9A64"},{"id":"emerald-location","type":"TEXT","name":"Lieu","x":120,"y":1060,"width":840,"height":110,"rotation":0,"locked":false,"editable":true,"zIndex":5,"text":"{{eventLocation}}","fontFamily":"Georgia","fontSize":30,"fontWeight":400,"align":"center","color":"#2E5D4A"}],"version":1}'::jsonb, CURRENT_TIMESTAMP),
('birthday-soft-modern', 'Anniversaire tout en douceur', 'Mise en page lumineuse pour un anniversaire avec couleur pastel et titre personnalisé.', 'BIRTHDAY', 'SOFT', ARRAY['anniversaire','pastel','doux','portrait'], '{"background":"#FFF7F2","accent":"#B06B62","style":"SOFT"}', '{"schemaVersion":1,"metadata":{"templateSlug":"birthday-soft-modern","templateVersion":1,"category":"BIRTHDAY","style":"SOFT"},"canvas":{"width":1080,"height":1920,"unit":"px"},"theme":{"category":"BIRTHDAY","style":"SOFT","palette":["#FFF7F2","#B06B62","#55494A"],"tokens":{"primary":"#B06B62","secondary":"#55494A","background":"#FFF7F2","font":"Georgia"}},"assets":[],"variables":[{"key":"coupleNames","label":"Nom à célébrer","type":"TEXT","defaultValue":"Nom à célébrer","required":true},{"key":"eventDate","label":"Date","type":"TEXT","defaultValue":"Date à confirmer","required":false},{"key":"eventLocation","label":"Lieu","type":"TEXT","defaultValue":"Nom du lieu","required":false}],"constraints":{"safeMargin":64,"allowOverflow":false},"layouts":[{"id":"portrait","name":"Portrait","width":1080,"height":1920}],"ceremonyRules":[],"exportProfiles":[{"id":"MOBILE_PORTRAIT","width":1080,"height":1920,"unit":"px"}],"elements":[{"id":"birthday-background","type":"BACKGROUND","name":"Fond crème","x":0,"y":0,"width":1080,"height":1920,"rotation":0,"locked":true,"editable":false,"zIndex":0,"fill":"#FFF7F2"},{"id":"birthday-panel","type":"SHAPE","name":"Panneau pastel","x":85,"y":420,"width":910,"height":1040,"rotation":0,"locked":true,"editable":false,"zIndex":1,"shape":"RECTANGLE","fill":"#F4E5DD","stroke":"#B06B62","strokeWidth":2},{"id":"birthday-title","type":"TEXT","name":"Nom à célébrer","x":140,"y":700,"width":800,"height":210,"rotation":0,"locked":false,"editable":true,"zIndex":2,"text":"{{coupleNames}}","fontFamily":"Georgia","fontSize":72,"fontWeight":400,"align":"center","color":"#55494A"},{"id":"birthday-date","type":"TEXT","name":"Date","x":140,"y":965,"width":800,"height":100,"rotation":0,"locked":false,"editable":true,"zIndex":3,"text":"{{eventDate}}","fontFamily":"Georgia","fontSize":34,"fontWeight":400,"align":"center","color":"#B06B62"},{"id":"birthday-location","type":"TEXT","name":"Lieu","x":140,"y":1110,"width":800,"height":120,"rotation":0,"locked":false,"editable":true,"zIndex":4,"text":"{{eventLocation}}","fontFamily":"Georgia","fontSize":28,"fontWeight":400,"align":"center","color":"#55494A"}],"version":1}'::jsonb, CURRENT_TIMESTAMP);
