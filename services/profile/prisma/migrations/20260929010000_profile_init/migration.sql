CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "identity_subject" VARCHAR(255) NOT NULL,
    "email" VARCHAR(320),
    "display_name" VARCHAR(100),
    "locale" VARCHAR(5) NOT NULL DEFAULT 'fr',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "profiles_identity_subject_key" ON "profiles"("identity_subject");
CREATE INDEX "profiles_email_idx" ON "profiles"("email");
