-- HigherStudy 4 — admin CSV import history.

CREATE TYPE "ImportStatus" AS ENUM ('COMMITTED', 'FAILED');

CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "issues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ImportJob_entity_chk" CHECK ("entity" IN ('universities', 'programs', 'professors')),
    CONSTRAINT "ImportJob_counts_chk" CHECK ("totalRows" >= 0 AND "created" >= 0 AND "updated" >= 0 AND "unchanged" >= 0 AND "skipped" >= 0)
);

CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");
CREATE INDEX "ImportJob_performedById_idx" ON "ImportJob"("performedById");

-- RESTRICT: an admin with import history is disabled, not deleted (same rule as audit logs).
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_performedById_fkey"
  FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
