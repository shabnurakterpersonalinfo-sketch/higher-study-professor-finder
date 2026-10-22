-- HigherStudy 3/3 — data integrity.
-- CHECK constraints for values the API validates, so imports and manual SQL
-- can't store impossible data either. Prisma ignores CHECKs (no drift noise).
-- Ranges match the score scales of each test; NULL is always allowed.

ALTER TABLE "StudentProfile"
  ADD CONSTRAINT "StudentProfile_cgpa_chk"       CHECK ("cgpa" IS NULL OR ("cgpa" >= 0 AND "cgpa" <= coalesce("cgpaScale", 10))),
  ADD CONSTRAINT "StudentProfile_gre_chk"        CHECK ("greScore" IS NULL OR "greScore" BETWEEN 260 AND 340),
  ADD CONSTRAINT "StudentProfile_ielts_chk"      CHECK ("ieltsScore" IS NULL OR ("ieltsScore" BETWEEN 0 AND 9 AND ("ieltsScore" * 2) = floor("ieltsScore" * 2))),
  ADD CONSTRAINT "StudentProfile_toefl_chk"      CHECK ("toeflScore" IS NULL OR "toeflScore" BETWEEN 0 AND 120),
  ADD CONSTRAINT "StudentProfile_degree_chk"     CHECK ("targetDegree" IN ('MS', 'PhD', 'PostDoc')),
  ADD CONSTRAINT "StudentProfile_funding_chk"    CHECK ("fundingPreference" IS NULL OR "fundingPreference" IN ('FULLY_FUNDED', 'PARTIAL', 'SELF'));

ALTER TABLE "University"
  ADD CONSTRAINT "University_rank_chk"           CHECK ("csRankPosition" IS NULL OR "csRankPosition" > 0);

ALTER TABLE "Program"
  ADD CONSTRAINT "Program_degree_chk"            CHECK ("degreeLevel" IN ('MS', 'PhD', 'PostDoc')),
  ADD CONSTRAINT "Program_fee_chk"               CHECK ("applicationFeeUsd" IS NULL OR "applicationFeeUsd" >= 0),
  ADD CONSTRAINT "Program_ielts_chk"             CHECK ("ieltsMinOverall" IS NULL OR "ieltsMinOverall" BETWEEN 0 AND 9),
  ADD CONSTRAINT "Program_funding_chk"           CHECK ("fundingLevel" IS NULL OR "fundingLevel" IN ('GUARANTEED', 'AVAILABLE', 'CONDITIONAL'));

ALTER TABLE "Professor"
  ADD CONSTRAINT "Professor_hindex_chk"          CHECK ("hIndex" IS NULL OR "hIndex" >= 0),
  ADD CONSTRAINT "Professor_citations_chk"       CHECK ("citationCount" IS NULL OR "citationCount" >= 0);

-- A reply can't arrive before the email was sent; a follow-up isn't due before it either.
ALTER TABLE "ProfessorOutreach"
  ADD CONSTRAINT "ProfessorOutreach_reply_after_send_chk"
    CHECK ("replyReceivedTime" IS NULL OR "emailSentTime" IS NULL OR "replyReceivedTime" >= "emailSentTime"),
  ADD CONSTRAINT "ProfessorOutreach_reminder_after_send_chk"
    CHECK ("nextReminderAt" IS NULL OR "emailSentTime" IS NULL OR "nextReminderAt" >= "emailSentTime");

ALTER TABLE "Application"
  ADD CONSTRAINT "Application_fee_chk"           CHECK ("feeAmount" IS NULL OR "feeAmount" >= 0);

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_amount_chk"        CHECK ("amount" >= 0),
  ADD CONSTRAINT "Transaction_currency_chk"      CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Transaction_gateway_chk"       CHECK ("paymentGateway" IN ('bKash', 'Nagad', 'Rocket', 'Manual'));
