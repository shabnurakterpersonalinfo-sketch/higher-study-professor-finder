-- Onboarding: profile setup gate, guided tours and "New" feature highlights.
ALTER TABLE "User"
  ADD COLUMN "profileCompletedAt" TIMESTAMP(3),
  ADD COLUMN "toursSeen" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "featuresSeen" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Accounts that existed before this release are already using the app: don't lock them
-- out behind the setup screen. Only sign-ups from now on go through it.
UPDATE "User" SET "profileCompletedAt" = "createdAt";

-- Keep the arrays small; the API also validates ids.
ALTER TABLE "User"
  ADD CONSTRAINT "User_toursSeen_len" CHECK (cardinality("toursSeen") <= 200),
  ADD CONSTRAINT "User_featuresSeen_len" CHECK (cardinality("featuresSeen") <= 200);
