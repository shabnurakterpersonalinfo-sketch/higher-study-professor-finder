-- HigherStudy 1/3 — tables, enums, B-tree indexes, foreign keys.
-- Mirrors prisma/schema.prisma. Search indexes are in migration 2, CHECK constraints in 3.
-- IDs are TEXT: seed rows keep their source slugs ("univ_mit"), new rows get UUIDs.

-- ---------------------------------------------------------------- enums
CREATE TYPE "Role" AS ENUM ('GU', 'ADMIN', 'SUPER_ADMIN');
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STARTER', 'PRO', 'PREMIUM');
CREATE TYPE "ReplyStatus" AS ENUM ('NOT_SENT', 'MAILED', 'POSITIVE_REPLY', 'INTERVIEW', 'NO_RESPONSE', 'DECLINED');
CREATE TYPE "ApplicationStatus" AS ENUM ('NOT_STARTED', 'PREPARING', 'SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'VISA');
CREATE TYPE "TransactionStatus" AS ENUM ('SUCCESS', 'PENDING', 'FAILED', 'MANUALLY_RECONCILED');
CREATE TYPE "OutreachEventType" AS ENUM ('INITIAL_SENT', 'REMINDER_SENT', 'REPLY_RECEIVED', 'INTERVIEW_SCHEDULED', 'STATUS_CHANGED', 'NOTE');
CREATE TYPE "SavedItemType" AS ENUM ('UNIVERSITY', 'PROFESSOR', 'PROGRAM');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- ---------------------------------------------------------------- tables
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'GU',
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "planExpiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "undergradInstitution" TEXT,
    "undergradMajor" TEXT,
    "graduationYear" INTEGER,
    "cgpa" DOUBLE PRECISION,
    "cgpaScale" DOUBLE PRECISION DEFAULT 4.0,
    "greScore" INTEGER,
    "ieltsScore" DOUBLE PRECISION,
    "toeflScore" INTEGER,
    "targetDegree" TEXT NOT NULL,
    "fundingPreference" TEXT,
    "targetIntake" TEXT,
    "preferredCountries" TEXT[],
    "researchInterests" TEXT[],
    "publications" JSONB,
    "experience" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "University" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "csRank" TEXT,
    "wesRequired" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT NOT NULL DEFAULT 'United States',
    "state" TEXT,
    "csRankPosition" INTEGER,
    "csRankTied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "programName" TEXT NOT NULL,
    "degreeLevel" TEXT NOT NULL,
    "catalogLink" TEXT,
    "deadlineDate" TEXT,
    "applicationFee" TEXT,
    "feeWaiverType" TEXT,
    "feeWaiverInfo" TEXT,
    "greRequirement" TEXT,
    "ieltsRequirement" TEXT,
    "financialAidPolicy" TEXT,
    "limitationsNotes" TEXT,
    "applicationFeeUsd" INTEGER,
    "greRequired" BOOLEAN,
    "ieltsMinOverall" DOUBLE PRECISION,
    "fundingLevel" TEXT,
    "wesRequired" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Professor" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "academicRank" TEXT,
    "email" TEXT,
    "department" TEXT,
    "photoUrl" TEXT,
    "bio" TEXT,
    "profileLink" TEXT,
    "googleScholarLink" TEXT,
    "labWebsite" TEXT,
    "hIndex" INTEGER,
    "citationCount" INTEGER,
    "acceptingStudents" BOOLEAN NOT NULL DEFAULT true,
    "researchAreas" TEXT[],
    "openPositions" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Professor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfessorOutreach" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "subject" TEXT,
    "emailSentTime" TIMESTAMP(3),
    "replyStatus" "ReplyStatus" NOT NULL DEFAULT 'NOT_SENT',
    "reminderSentTime" TIMESTAMP(3),
    "nextReminderAt" TIMESTAMP(3),
    "replyReceivedTime" TIMESTAMP(3),
    "fundingStatus" TEXT,
    "interviewStatus" TEXT,
    "interviewAt" TIMESTAMP(3),
    "professorReplyNotes" TEXT,
    "attachedCvUrl" TEXT,
    "attachedProposalUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfessorOutreach_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutreachEvent" (
    "id" TEXT NOT NULL,
    "outreachId" TEXT NOT NULL,
    "type" "OutreachEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "meta" JSONB,
    CONSTRAINT "OutreachEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "department" TEXT,
    "programType" TEXT,
    "intakeTerm" TEXT,
    "applicationRound" TEXT,
    "appliedAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "expectedDecisionDate" TIMESTAMP(3),
    "enrollmentDate" TIMESTAMP(3),
    "interviewAt" TIMESTAMP(3),
    "feeStatus" TEXT,
    "feeAmount" DOUBLE PRECISION,
    "applicationMethod" TEXT,
    "feeWaiverClaimed" BOOLEAN NOT NULL DEFAULT false,
    "trackingReferenceId" TEXT,
    "officialTranscriptSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "lor1Submitted" BOOLEAN NOT NULL DEFAULT false,
    "lor2Submitted" BOOLEAN NOT NULL DEFAULT false,
    "lor3Submitted" BOOLEAN NOT NULL DEFAULT false,
    "sopSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "cvSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "greSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "ieltsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "toeflSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisaReminder" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "targetCountry" TEXT NOT NULL,
    "i20OrCasReceivedDate" TIMESTAMP(3),
    "visaAppointmentDate" TIMESTAMP(3),
    "sevisFeePaid" BOOLEAN NOT NULL DEFAULT false,
    "bankSolvencyExpiryDate" TIMESTAMP(3),
    "passportExpiryDate" TIMESTAMP(3),
    "customNotes" TEXT,
    "notificationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisaReminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedItem" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "SavedItemType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "paymentGateway" TEXT NOT NULL,
    "gatewayTransactionId" TEXT,
    "gatewayPaymentId" TEXT,
    "planPurchased" "SubscriptionPlan" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransactionAudit" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "performedByAdminId" TEXT NOT NULL,
    "previousStatus" "TransactionStatus" NOT NULL,
    "newStatus" "TransactionStatus" NOT NULL,
    "referenceId" TEXT,
    "reconciliationNotes" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransactionAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminActionLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------- indexes (B-tree / GIN from schema)
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");
CREATE INDEX "StudentProfile_researchInterests_idx" ON "StudentProfile" USING GIN ("researchInterests");
CREATE INDEX "University_name_idx" ON "University"("name");
CREATE INDEX "University_csRank_idx" ON "University"("csRank");
CREATE INDEX "University_csRankPosition_idx" ON "University"("csRankPosition");
CREATE INDEX "University_country_state_idx" ON "University"("country", "state");
CREATE INDEX "Program_universityId_degreeLevel_idx" ON "Program"("universityId", "degreeLevel");
CREATE INDEX "Program_degreeLevel_fundingLevel_idx" ON "Program"("degreeLevel", "fundingLevel");
CREATE INDEX "Professor_universityId_acceptingStudents_idx" ON "Professor"("universityId", "acceptingStudents");
CREATE INDEX "Professor_researchAreas_idx" ON "Professor" USING GIN ("researchAreas");
CREATE UNIQUE INDEX "ProfessorOutreach_studentId_professorId_key" ON "ProfessorOutreach"("studentId", "professorId");
CREATE INDEX "ProfessorOutreach_studentId_replyStatus_idx" ON "ProfessorOutreach"("studentId", "replyStatus");
CREATE INDEX "ProfessorOutreach_emailSentTime_replyStatus_idx" ON "ProfessorOutreach"("emailSentTime", "replyStatus");
CREATE INDEX "ProfessorOutreach_nextReminderAt_idx" ON "ProfessorOutreach"("nextReminderAt");
CREATE INDEX "OutreachEvent_outreachId_occurredAt_idx" ON "OutreachEvent"("outreachId", "occurredAt");
CREATE UNIQUE INDEX "Application_studentId_programId_key" ON "Application"("studentId", "programId");
CREATE INDEX "Application_studentId_status_idx" ON "Application"("studentId", "status");
CREATE INDEX "Application_deadline_idx" ON "Application"("deadline");
CREATE INDEX "VisaReminder_studentId_idx" ON "VisaReminder"("studentId");
CREATE INDEX "VisaReminder_visaAppointmentDate_idx" ON "VisaReminder"("visaAppointmentDate");
CREATE INDEX "VisaReminder_bankSolvencyExpiryDate_idx" ON "VisaReminder"("bankSolvencyExpiryDate");
CREATE UNIQUE INDEX "SavedItem_studentId_type_targetId_key" ON "SavedItem"("studentId", "type", "targetId");
CREATE INDEX "SavedItem_studentId_type_idx" ON "SavedItem"("studentId", "type");
CREATE UNIQUE INDEX "Transaction_gatewayTransactionId_key" ON "Transaction"("gatewayTransactionId");
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");
CREATE INDEX "Transaction_status_paymentGateway_createdAt_idx" ON "Transaction"("status", "paymentGateway", "createdAt");
CREATE INDEX "Transaction_gatewayPaymentId_idx" ON "Transaction"("gatewayPaymentId");
CREATE INDEX "TransactionAudit_transactionId_idx" ON "TransactionAudit"("transactionId");
CREATE INDEX "TransactionAudit_performedByAdminId_idx" ON "TransactionAudit"("performedByAdminId");
CREATE INDEX "AdminActionLog_adminId_createdAt_idx" ON "AdminActionLog"("adminId", "createdAt");
CREATE INDEX "AdminActionLog_targetType_targetId_idx" ON "AdminActionLog"("targetType", "targetId");
CREATE INDEX "AdminActionLog_createdAt_idx" ON "AdminActionLog"("createdAt");
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- ---------------------------------------------------------------- foreign keys
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Program" ADD CONSTRAINT "Program_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Professor" ADD CONSTRAINT "Professor_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessorOutreach" ADD CONSTRAINT "ProfessorOutreach_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessorOutreach" ADD CONSTRAINT "ProfessorOutreach_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachEvent" ADD CONSTRAINT "OutreachEvent_outreachId_fkey" FOREIGN KEY ("outreachId") REFERENCES "ProfessorOutreach"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisaReminder" ADD CONSTRAINT "VisaReminder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionAudit" ADD CONSTRAINT "TransactionAudit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionAudit" ADD CONSTRAINT "TransactionAudit_performedByAdminId_fkey" FOREIGN KEY ("performedByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminActionLog" ADD CONSTRAINT "AdminActionLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
