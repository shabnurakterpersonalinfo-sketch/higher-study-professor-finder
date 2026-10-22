import type { AppStatus, Plan, ReplyStatus, TxStatus } from './types';

export const fmtDate = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
export const fmtTime = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
export const fmtNum = (n?: number | null) => (n == null ? '—' : n.toLocaleString('en-US'));
export const fmtBdt = (n: number) => `${n.toLocaleString('en-US')} BDT`;
export const daysFromNow = (d?: string | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000) : null);
export const initials = (name: string) =>
  name
    .replace(/^(Prof\.|Dr\.)\s*/i, '')
    .replace(/\([^)]*\)/g, ' ') // "Qiang (Shawn) Cheng" → "QC"
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

type Tone = 'green' | 'blue' | 'red' | 'amber' | 'gray' | 'violet' | 'orange' | 'teal' | 'indigo';

export const REPLY: Record<ReplyStatus | 'REMINDER_DUE', { label: string; tone: Tone }> = {
  NOT_SENT: { label: 'Not sent', tone: 'gray' },
  MAILED: { label: 'Waiting', tone: 'amber' },
  POSITIVE_REPLY: { label: 'Positive reply', tone: 'green' },
  INTERVIEW: { label: 'Interview', tone: 'blue' },
  NO_RESPONSE: { label: 'No response', tone: 'red' },
  DECLINED: { label: 'Declined', tone: 'red' },
  REMINDER_DUE: { label: 'Reminder due', tone: 'orange' },
};

export const APP: Record<AppStatus, { label: string; tone: Tone; dot: string }> = {
  NOT_STARTED: { label: 'Not started', tone: 'gray', dot: 'bg-slate-400' },
  PREPARING: { label: 'Preparing', tone: 'blue', dot: 'bg-blue-500' },
  SUBMITTED: { label: 'Submitted', tone: 'violet', dot: 'bg-violet-500' },
  UNDER_REVIEW: { label: 'Waiting', tone: 'amber', dot: 'bg-amber-400' },
  INTERVIEW: { label: 'Interview', tone: 'orange', dot: 'bg-orange-500' },
  ACCEPTED: { label: 'Accepted', tone: 'green', dot: 'bg-emerald-500' },
  REJECTED: { label: 'Rejected', tone: 'red', dot: 'bg-red-500' },
  VISA: { label: 'Visa', tone: 'teal', dot: 'bg-cyan-500' },
};
export const APP_ORDER: AppStatus[] = ['NOT_STARTED', 'PREPARING', 'SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'VISA'];

export const TX: Record<TxStatus, { label: string; tone: Tone }> = {
  SUCCESS: { label: 'Success', tone: 'green' },
  PENDING: { label: 'Pending', tone: 'amber' },
  FAILED: { label: 'Failed', tone: 'red' },
  MANUALLY_RECONCILED: { label: 'Reconciled', tone: 'indigo' },
};

export const PLAN_LABEL: Record<Plan, string> = { FREE: 'Free', STARTER: 'Starter', PRO: 'Pro', PREMIUM: 'Premium' };
export const PLAN_ORDER: Plan[] = ['FREE', 'STARTER', 'PRO', 'PREMIUM'];

export const TONES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  blue: 'bg-sky-50 text-sky-700 ring-sky-100',
  red: 'bg-rose-50 text-rose-600 ring-rose-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  gray: 'bg-slate-100/70 text-slate-600 ring-slate-200/60',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  orange: 'bg-orange-50 text-orange-600 ring-orange-100',
  teal: 'bg-teal-50 text-teal-700 ring-teal-100',
  indigo: 'bg-brand-50 text-brand-700 ring-brand-100',
};
export type { Tone };

export const FUNDING: Record<string, { label: string; tone: Tone }> = {
  GUARANTEED: { label: 'Funding guaranteed', tone: 'green' },
  AVAILABLE: { label: 'Assistantships available', tone: 'blue' },
  CONDITIONAL: { label: 'Funding depends on grants', tone: 'amber' },
};

/** "#2 in Computer Science (tie)" → "#2 CS (tie)". */
export const shortRank = (r?: string | null) => (r ? r.replace(/\s+in\s+Computer Science/i, ' CS') : 'Unranked');

/** Initials for a university tile: "University of Texas - El Paso" → "UTEP". */
export const uniInitials = (name: string) =>
  name
    .replace(/--|-|–/g, ' ')
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w) && !['Of', 'At', 'The'].includes(w))
    .map((w) => w[0])
    .join('')
    .slice(0, 5);
