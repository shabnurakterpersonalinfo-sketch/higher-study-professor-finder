/* eslint-disable no-console */
/**
 * Seeds HigherStudy from the CSV exports in prisma/seed-data/.
 *
 *   npx prisma db seed                       # dev: users get SEED_PASSWORD (default Password123!)
 *   SEED_DIR=./my-data npx prisma db seed    # alternative folder with the same file names
 *   SEED_STRICT=1 npx prisma db seed         # fail on any data-quality warning
 *
 * Behaviour
 *  1. Parse + validate every file (column counts, enums, foreign keys, dates) BEFORE writing.
 *     Any error aborts with nothing written.
 *  2. Upsert every row by its CSV id inside one transaction, so re-running applies edits
 *     instead of duplicating. Derived columns come from src/common/derive.ts.
 *  3. Print a data-quality report: missing values, placeholders, cross-file inconsistencies.
 *
 * Timestamps without a zone ("2025-10-23 02:31:00") are read in SEED_TZ (default +06:00, Dhaka).
 */
import { ApplicationStatus, PrismaClient, ReplyStatus, Role, SubscriptionPlan, TransactionStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parseCsv } from '../src/common/csv';
import { clean, normalizeFundingPreference, splitList } from '../src/common/derive';
import { parseProfessorRow, parseProgramRow, parseUniversityRow, RowResult } from '../src/common/directory-rows';
import { PLANS, planRank } from '../src/common/plans';

const prisma = new PrismaClient();
const DIR = resolve(process.env.SEED_DIR ?? join(__dirname, 'seed-data'));
const TZ = process.env.SEED_TZ ?? '+06:00';
const STRICT = process.env.SEED_STRICT === '1';

const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

// ---------------------------------------------------------------- helpers
function load(file: string) {
  try {
    return parseCsv(readFileSync(join(DIR, file), 'utf8'), file);
  } catch (e) {
    err((e as Error).message);
    return [];
  }
}
function bool(v: string, where: string, fallback?: boolean): boolean {
  const t = clean(v)?.toLowerCase();
  if (t == null) {
    if (fallback === undefined) err(`${where}: boolean is empty`);
    return fallback ?? false;
  }
  if (['true', '1', 'yes', 'y'].includes(t)) return true;
  if (['false', '0', 'no', 'n'].includes(t)) return false;
  err(`${where}: "${v}" is not a boolean`);
  return false;
}
function num(v: string, where: string, int = false): number | null {
  const t = clean(v);
  if (t == null) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || (int && !Number.isInteger(n))) return err(`${where}: "${v}" is not a${int ? 'n integer' : ' number'}`), null;
  return n;
}
/** "2025-10-23 02:31:00" (SEED_TZ) or "2026-05-15" (date only, stored as UTC midnight). */
function date(v: string, where: string): Date | null {
  const t = clean(v);
  if (t == null) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T00:00:00Z` : /[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? t.replace(' ', 'T') : `${t.replace(' ', 'T')}${TZ}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return err(`${where}: "${v}" is not a date`), null;
  return d;
}
function oneOf<T extends string>(v: string, allowed: readonly T[], where: string): T {
  const t = clean(v) as T | null;
  if (!t || !allowed.includes(t)) err(`${where}: "${v}" is not one of ${allowed.join(', ')}`);
  return (t ?? allowed[0]) as T;
}
function ref(id: string, set: Set<string>, where: string) {
  if (!set.has(id)) err(`${where}: unknown id "${id}"`);
  return id;
}
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// ---------------------------------------------------------------- 1. parse + validate
function build() {
  // Directory files use the same row parsers as the admin CSV import (src/common/directory-rows.ts).
  function directory<T>(file: string, parse: (r: Record<string, string>) => RowResult<T>) {
    const out: (T & { id: string })[] = [];
    for (const r of load(file)) {
      const w = `${file} ${r.id || '(no id)'}`;
      const res = parse(r);
      res.errors.forEach((e) => err(`${w}: ${e}`));
      res.warnings.forEach((m) => warn(`${w}: ${m}`));
      if (!r.id) err(`${w}: seed rows need an id`);
      if (res.data && r.id) out.push({ ...res.data, id: r.id });
    }
    return out;
  }

  const universities = directory('universities.csv', parseUniversityRow);
  const uniIds = new Set(universities.map((u) => u.id));

  const programs = directory('programs.csv', parseProgramRow).map(({ universityRef, ...p }) => ({
    ...p,
    universityId: ref(universityRef, uniIds, `programs.csv ${p.id}`),
  }));
  const programIds = new Set(programs.map((p) => p.id));

  const professors = directory('professors.csv', parseProfessorRow).map(({ universityRef, acceptingStudents, ...p }) => {
    if (acceptingStudents == null) warn(`professors.csv ${p.id}: accepting_students empty — defaulting to true`);
    return { ...p, acceptingStudents: acceptingStudents ?? true, universityId: ref(universityRef, uniIds, `professors.csv ${p.id}`) };
  });
  const profIds = new Set(professors.map((p) => p.id));

  const users = load('users.csv').map((r) => {
    const w = `users.csv ${r.id}`;
    const hash = clean(r.password_hash);
    return {
      id: r.id,
      email: r.email.trim().toLowerCase(),
      csvHash: hash && BCRYPT.test(hash) ? hash : null,
      role: oneOf(r.role, Object.values(Role), w),
      plan: oneOf(r.plan, Object.values(SubscriptionPlan), w),
      createdAt: date(r.created_at, w) ?? new Date(),
    };
  });
  const userIds = new Set(users.map((u) => u.id));
  const placeholderHashes = users.filter((u) => !u.csvHash).map((u) => u.email);

  const students = load('students.csv').map((r) => {
    const w = `students.csv ${r.id}`;
    const funding = normalizeFundingPreference(r.funding_preference);
    if (clean(r.funding_preference) && !funding) err(`${w}: unknown funding_preference "${r.funding_preference}"`);
    return {
      id: r.id,
      userId: ref(r.user_id, userIds, w),
      fullName: r.full_name.trim(),
      cgpa: num(r.cgpa, w),
      greScore: num(r.gre_score, w, true),
      ieltsScore: num(r.ielts_score, w),
      toeflScore: num(r.toefl_score, w, true),
      targetDegree: oneOf(r.target_degree, ['MS', 'PhD', 'PostDoc'] as const, w),
      fundingPreference: funding,
      targetIntake: clean(r.target_intake),
      preferredCountries: splitList(r.preferred_countries),
      researchInterests: splitList(r.research_interests),
    };
  });
  const studentIds = new Set(students.map((s) => s.id));
  for (const s of students) {
    const u = users.find((x) => x.id === s.userId);
    if (u && u.role !== 'GU') err(`students.csv ${s.id}: user ${u.id} has role ${u.role}, expected GU`);
  }

  const outreach = load('professor_outreach.csv').map((r) => {
    const w = `professor_outreach.csv ${r.id}`;
    const status = oneOf(r.reply_status, Object.values(ReplyStatus), w);
    const sent = date(r.email_sent_time, w);
    const reply = date(r.reply_received_time, w);
    // The source "reminder_sent_time" is always sent + 7 days, including on threads that
    // were already answered — it's the scheduled follow-up, not a reminder that was sent.
    const scheduled = date(r.reminder_sent_time, w);
    if (reply && sent && reply < sent) err(`${w}: reply_received_time is before email_sent_time`);
    if (status !== 'NOT_SENT' && !sent) err(`${w}: status ${status} but no email_sent_time`);
    const interview = clean(r.interview_status);
    if (interview && /scheduled/i.test(interview)) warn(`${w}: interview "${interview}" has no date — no timeline event created`);
    if (status === 'MAILED' && !reply && !scheduled) warn(`${w}: MAILED with no follow-up date — worker will use sent + 7 days`);
    return {
      id: r.id,
      studentId: ref(r.student_id, studentIds, w),
      professorId: ref(r.professor_id, profIds, w),
      emailSentTime: sent,
      replyStatus: status,
      nextReminderAt: status === 'MAILED' ? scheduled : null,
      replyReceivedTime: reply,
      fundingStatus: clean(r.funding_status),
      interviewStatus: interview,
      professorReplyNotes: clean(r.professor_reply_notes),
      attachedCvUrl: clean(r.attached_cv_url),
      attachedProposalUrl: clean(r.attached_proposal_url),
    };
  });
  const pairs = new Set<string>();
  for (const o of outreach) {
    const k = `${o.studentId}/${o.professorId}`;
    if (pairs.has(k)) err(`professor_outreach.csv ${o.id}: duplicate thread for ${k}`);
    pairs.add(k);
  }

  const applications = load('applications.csv').map((r) => {
    const w = `applications.csv ${r.id}`;
    const b = (k: string) => bool(r[k], `${w} ${k}`, false);
    return {
      id: r.id,
      studentId: ref(r.student_id, studentIds, w),
      programId: ref(r.program_id, programIds, w),
      status: oneOf(r.status, Object.values(ApplicationStatus), w),
      feeWaiverClaimed: b('fee_waiver_claimed'),
      trackingReferenceId: clean(r.tracking_reference_id),
      officialTranscriptSubmitted: b('official_transcript_submitted'),
      lor1Submitted: b('lor1_submitted'),
      lor2Submitted: b('lor2_submitted'),
      lor3Submitted: b('lor3_submitted'),
      sopSubmitted: b('sop_submitted'),
      cvSubmitted: b('cv_submitted'),
      greSubmitted: b('gre_submitted'),
      ieltsSubmitted: b('ielts_submitted'),
      notes: clean(r.notes),
    };
  });

  const visas = load('visa_reminders.csv').map((r) => {
    const w = `visa_reminders.csv ${r.id}`;
    return {
      id: r.id,
      studentId: ref(r.student_id, studentIds, w),
      targetCountry: r.target_country.trim(),
      i20OrCasReceivedDate: date(r.i20_or_cas_received_date, w),
      visaAppointmentDate: date(r.visa_appointment_date, w),
      sevisFeePaid: bool(r.sevis_fee_paid, w, false),
      bankSolvencyExpiryDate: date(r.bank_solvency_expiry_date, w),
      customNotes: clean(r.custom_notes),
      notificationEnabled: bool(r.notification_enabled, w, true),
    };
  });

  const transactions = load('transactions.csv').map((r) => {
    const w = `transactions.csv ${r.id}`;
    const amount = num(r.amount, w) ?? 0;
    const plan = oneOf(r.plan_purchased, Object.values(SubscriptionPlan), w);
    const status = oneOf(r.status, Object.values(TransactionStatus), w);
    if (status !== 'FAILED' && amount !== PLANS[plan].priceBdt) warn(`${w}: ${amount} BDT doesn't match the ${plan} price (${PLANS[plan].priceBdt})`);
    if (status === 'MANUALLY_RECONCILED') warn(`${w}: MANUALLY_RECONCILED with no reconciliation record in the source — imported without an audit entry`);
    return {
      id: r.id,
      userId: ref(r.user_id, userIds, w),
      amount,
      currency: clean(r.currency) ?? 'BDT',
      paymentGateway: oneOf(r.payment_gateway, ['bKash', 'Nagad', 'Rocket', 'Manual'] as const, w),
      gatewayTransactionId: clean(r.gateway_transaction_id),
      planPurchased: plan,
      status,
      createdAt: date(r.created_at, w) ?? new Date(),
    };
  });

  // ---- cross-file consistency
  for (const u of users) {
    const settled = transactions
      .filter((t) => t.userId === u.id && (t.status === 'SUCCESS' || t.status === 'MANUALLY_RECONCILED'))
      .sort((a, b) => +b.createdAt - +a.createdAt)[0];
    if (settled && planRank(settled.planPurchased) > planRank(u.plan)) {
      warn(`users.csv ${u.id}: plan is ${u.plan} but transaction ${settled.id} settled a ${settled.planPurchased} purchase — kept ${u.plan}`);
    }
    if (settled && PLANS[u.plan].validityDays) {
      const ends = new Date(+settled.createdAt + PLANS[u.plan].validityDays! * 86_400_000);
      if (ends < new Date()) warn(`users.csv ${u.id}: last payment ${settled.id} would have expired on ${ends.toISOString().slice(0, 10)} — planExpiresAt left empty so the expiry job doesn't downgrade imported users`);
    }
  }
  for (const v of visas) {
    const s = students.find((x) => x.id === v.studentId);
    const u = s && users.find((x) => x.id === s.userId);
    if (u && !PLANS[u.plan].visaTracking) warn(`visa_reminders.csv ${v.id}: ${u.email} is on ${u.plan}, which doesn't include visa tracking — they won't see this reminder until upgraded`);
  }
  for (const u of universities) {
    const nP = programs.filter((p) => p.universityId === u.id).length;
    const nF = professors.filter((p) => p.universityId === u.id).length;
    if (!nP && !nF) warn(`universities.csv ${u.id}: no programs or professors yet`);
  }

  return { universities, programs, professors, users, placeholderHashes, students, outreach, applications, visas, transactions };
}

/** "programs.csv a: x" + "programs.csv b: x" → "programs.csv: x (a, b)". */
function groupWarnings(list: string[]): string[] {
  const groups = new Map<string, string[]>();
  for (const w of list) {
    const m = w.match(/^(\S+\.csv) (\S+): (.*)$/);
    const key = m ? `${m[1]}: ${m[3]}` : w;
    groups.set(key, [...(groups.get(key) ?? []), ...(m ? [m[2]] : [])]);
  }
  return [...groups].map(([k, ids]) => (ids.length ? `${k} — ${ids.length > 1 ? `${ids.length} rows: ` : ''}${ids.join(', ')}` : k));
}

// ---------------------------------------------------------------- 2. write
async function main() {
  console.log(`Seeding from ${DIR}`);
  const d = build();
  if (errors.length) {
    console.error(`\n✗ ${errors.length} error(s) — nothing was written:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  if (STRICT && warnings.length) {
    console.error(`\n✗ SEED_STRICT: ${warnings.length} warning(s):\n  ${warnings.join('\n  ')}`);
    process.exit(1);
  }

  let devPassword: string | null = null;
  if (d.placeholderHashes.length) {
    devPassword = process.env.SEED_PASSWORD ?? null;
    if (!devPassword) {
      if (process.env.NODE_ENV === 'production') {
        console.error('✗ users.csv has placeholder password hashes; set SEED_PASSWORD (not allowed to default in production).');
        process.exit(1);
      }
      devPassword = 'Password123!';
    }
    warn(`users.csv: ${d.placeholderHashes.length} placeholder password hash(es) replaced with SEED_PASSWORD for ${d.placeholderHashes.join(', ')}`);
  }
  const devHash = devPassword ? await bcrypt.hash(devPassword, 12) : '';

  await prisma.$transaction(
    async (tx) => {
      for (const u of d.universities) await tx.university.upsert({ where: { id: u.id }, create: u, update: u });
      for (const p of d.programs) await tx.program.upsert({ where: { id: p.id }, create: p, update: p });
      for (const p of d.professors) await tx.professor.upsert({ where: { id: p.id }, create: p, update: p });
      for (const { csvHash, ...u } of d.users) {
        const row = { ...u, passwordHash: csvHash ?? devHash };
        // Seeded accounts predate onboarding (see migration 20261022000400): they skip the setup gate.
        await tx.user.upsert({ where: { id: u.id }, create: { ...row, profileCompletedAt: u.createdAt }, update: row });
      }
      for (const s of d.students) await tx.studentProfile.upsert({ where: { id: s.id }, create: s, update: s });
      for (const o of d.outreach) {
        await tx.professorOutreach.upsert({ where: { id: o.id }, create: o, update: o });
        // Timeline events are derived from the CSV timestamps; rebuild them on every run.
        await tx.outreachEvent.deleteMany({ where: { outreachId: o.id } });
        const events = [
          o.emailSentTime && { outreachId: o.id, type: 'INITIAL_SENT' as const, occurredAt: o.emailSentTime, meta: { source: 'seed' } },
          o.replyReceivedTime && {
            outreachId: o.id,
            type: 'REPLY_RECEIVED' as const,
            occurredAt: o.replyReceivedTime,
            note: o.replyStatus === 'DECLINED' ? 'Declined' : o.replyStatus === 'POSITIVE_REPLY' ? 'Positive reply' : null,
            meta: { source: 'seed' },
          },
        ].filter((e): e is NonNullable<typeof e> => !!e);
        if (events.length) await tx.outreachEvent.createMany({ data: events });
      }
      for (const a of d.applications) await tx.application.upsert({ where: { id: a.id }, create: a, update: a });
      for (const v of d.visas) await tx.visaReminder.upsert({ where: { id: v.id }, create: v, update: v });
      for (const t of d.transactions) await tx.transaction.upsert({ where: { id: t.id }, create: t, update: t });
    },
    { timeout: 60_000 },
  );

  const counts = Object.entries({
    universities: d.universities,
    programs: d.programs,
    professors: d.professors,
    users: d.users,
    students: d.students,
    outreach: d.outreach,
    applications: d.applications,
    visa_reminders: d.visas,
    transactions: d.transactions,
  }).map(([k, v]) => `${k} ${v.length}`);
  console.log(`✓ Upserted: ${counts.join(' · ')}`);
  if (devPassword) console.log(`  Dev logins (password "${devPassword}"): ${d.placeholderHashes.join(', ')}`);
  if (warnings.length) console.log(`\n⚠ Data-quality report (${warnings.length}):\n  ${groupWarnings(warnings).join('\n  ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
