export type Role = 'GU' | 'ADMIN' | 'SUPER_ADMIN';
export type Plan = 'FREE' | 'STARTER' | 'PRO' | 'PREMIUM';
export type ReplyStatus = 'NOT_SENT' | 'MAILED' | 'POSITIVE_REPLY' | 'INTERVIEW' | 'NO_RESPONSE' | 'DECLINED';
export type AppStatus = 'NOT_STARTED' | 'PREPARING' | 'SUBMITTED' | 'UNDER_REVIEW' | 'INTERVIEW' | 'ACCEPTED' | 'REJECTED' | 'VISA';
export type TxStatus = 'SUCCESS' | 'PENDING' | 'FAILED' | 'MANUALLY_RECONCILED';

export interface Me {
  id: string;
  email: string;
  role: Role;
  plan: Plan;
  fullName: string;
  avatarUrl: string | null;
  studentProfileId: string | null;
  /** False until a new student finishes the essentials setup (/welcome). */
  setupDone: boolean;
  unreadNotifications: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MatchResult {
  score: number;
  reasons: { ok: boolean; text: string }[];
}

export type FundingLevel = 'GUARANTEED' | 'AVAILABLE' | 'CONDITIONAL';

export interface Program {
  id: string;
  universityId?: string;
  programName: string;
  degreeLevel: string;
  catalogLink?: string | null;
  deadlineDate?: string | null;
  applicationFee?: string | null;
  applicationFeeUsd?: number | null;
  feeWaiverType?: string | null;
  feeWaiverInfo?: string | null;
  greRequirement?: string | null;
  greRequired?: boolean | null;
  ieltsRequirement?: string | null;
  ieltsMinOverall?: number | null;
  financialAidPolicy?: string | null;
  limitationsNotes?: string | null;
  fundingLevel?: FundingLevel | null;
  wesRequired?: boolean;
  university?: { id: string; name: string; wesRequired?: boolean };
}

export interface University {
  id: string;
  name: string;
  location: string;
  country: string;
  state?: string | null;
  csRank?: string | null;
  csRankPosition?: number | null;
  csRankTied?: boolean;
  wesRequired: boolean;
  researchAreas?: string[];
  programs?: Program[];
  match?: MatchResult | null;
  saved?: boolean;
  _count?: { professors: number; programs?: number };
}

export interface OpenPosition {
  type: string;
  count?: number;
  term?: string;
}

export interface ProfessorRow {
  id: string;
  universityId: string;
  name: string;
  title?: string | null;
  academicRank?: string | null;
  email?: string | null;
  department?: string | null;
  photoUrl?: string | null;
  hIndex?: number | null;
  citationCount?: number | null;
  acceptingStudents: boolean;
  researchAreas: string[];
  openPositions?: OpenPosition[] | null;
  universityName?: string;
  universityLocation?: string;
  universityCsRank?: string | null;
  matchedAreas?: string[];
}

export interface ProfessorDetail extends ProfessorRow {
  bio?: string | null;
  labWebsite?: string | null;
  googleScholarLink?: string | null;
  profileLink?: string | null;
  university: { id: string; name: string; location: string; country: string; csRank?: string | null; wesRequired: boolean };
  outreachStats: { threads: number; insufficientData?: true; replyRate?: number; positiveRate?: number; medianResponseHours?: number | null };
  myOutreach: { id: string; replyStatus: ReplyStatus; emailSentTime: string | null; replyReceivedTime: string | null } | null;
  saved: boolean;
}

export interface OutreachRow {
  id: string;
  subject?: string | null;
  emailSentTime: string | null;
  reminderSentTime: string | null;
  nextReminderAt: string | null;
  replyReceivedTime: string | null;
  replyStatus: ReplyStatus;
  professorReplyNotes?: string | null;
  fundingStatus?: string | null;
  interviewStatus?: string | null;
  reminderDue: boolean;
  attachedCvUrl?: string | null;
  attachedProposalUrl?: string | null;
  updatedAt: string;
  professor: { id: string; name: string; title?: string | null; email?: string | null; photoUrl?: string | null; university: { id: string; name: string; location?: string } };
  events?: { id: string; type: string; occurredAt: string; note?: string | null }[];
}

export interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
  done: boolean;
}

export interface Application {
  id: string;
  status: AppStatus;
  intakeTerm?: string | null;
  deadline?: string | null;
  appliedAt?: string | null;
  interviewAt?: string | null;
  notes?: string | null;
  trackingReferenceId?: string | null;
  feeWaiverClaimed?: boolean;
  checklist?: ChecklistItem[];
  documentsComplete?: number;
  documentsTotal?: number;
  program: Program & { university: { id: string; name: string; country: string; location?: string; wesRequired?: boolean } };
  [k: string]: unknown;
}

export interface Transaction {
  id: string;
  amount: number;
  currency: string;
  paymentGateway: string;
  gatewayTransactionId?: string | null;
  planPurchased: Plan;
  status: TxStatus;
  createdAt: string;
  user?: { id: string; email: string; studentProfile?: { fullName: string } | null };
  auditLogs?: { reconciliationNotes: string; referenceId?: string | null; admin: { email: string }; timestamp: string }[];
}
