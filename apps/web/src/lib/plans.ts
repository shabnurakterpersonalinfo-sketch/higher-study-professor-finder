import type { Plan } from './types';

/**
 * Plan marketing copy. Prices, limits and gateway availability come from
 * GET /payments/plans; only wording lives here. Rows marked `enforced` are
 * checked by the API (PlanGuard / application cap) — keep them in sync with
 * apps/api/src/common/plans.ts.
 */
export interface PlanCopy {
  plan: Plan;
  name: string;
  tagline: string;
  for: string;
  includesLabel: string;
  highlights: string[];
}

export const PLAN_COPY: Record<Plan, PlanCopy> = {
  FREE: {
    plan: 'FREE',
    name: 'Free',
    tagline: 'Explore programs and professors',
    for: 'For getting started',
    includesLabel: 'Includes',
    highlights: ['Track up to 3 applications', 'Search every university and professor', 'Basic email outreach tracking', 'Follow-up reminders', 'Community support'],
  },
  STARTER: {
    plan: 'STARTER',
    name: 'Starter',
    tagline: 'Run a focused application season',
    for: 'For serious applicants',
    includesLabel: 'Everything in Free, plus',
    highlights: ['Track up to 20 applications', 'Advanced email tracker', 'Document templates', 'Application deadline alerts', 'Priority support'],
  },
  PRO: {
    plan: 'PRO',
    name: 'Pro',
    tagline: 'Apply widely, from shortlist to visa',
    for: 'For advanced planning',
    includesLabel: 'Everything in Starter, plus',
    highlights: ['Unlimited applications', 'Visa timeline tracking & reminders', 'Professor & university insights', 'Personalized recommendations', 'Custom reminders'],
  },
  PREMIUM: {
    plan: 'PREMIUM',
    name: 'Premium',
    tagline: 'Expert help at every step',
    for: 'For complete support',
    includesLabel: 'Everything in Pro, plus',
    highlights: ['1-on-1 expert consultation', 'SOP & LOR review (2× / month)', 'Interview preparation', 'Application review', 'Dedicated success manager', '24/7 premium support'],
  },
};

type Cell = boolean | string;
export interface CompareRow {
  label: string;
  values: Record<Plan, Cell>;
  enforced?: boolean;
  note?: string;
}
export const COMPARE: { group: string; rows: CompareRow[] }[] = [
  {
    group: 'Applications',
    rows: [
      { label: 'Tracked applications', values: { FREE: '3', STARTER: '20', PRO: 'Unlimited', PREMIUM: 'Unlimited' }, enforced: true },
      { label: 'Program-specific document checklists', values: { FREE: true, STARTER: true, PRO: true, PREMIUM: true } },
      { label: 'Application deadline alerts', values: { FREE: false, STARTER: true, PRO: true, PREMIUM: true } },
      { label: 'Document templates', values: { FREE: false, STARTER: true, PRO: true, PREMIUM: true } },
    ],
  },
  {
    group: 'Professors & outreach',
    rows: [
      { label: 'University & professor search', values: { FREE: true, STARTER: true, PRO: true, PREMIUM: true } },
      { label: 'Email outreach tracker', values: { FREE: 'Basic', STARTER: 'Advanced', PRO: 'Advanced', PREMIUM: 'Advanced' } },
      { label: 'Follow-up reminders (7 days)', values: { FREE: true, STARTER: true, PRO: true, PREMIUM: true } },
      { label: 'Professor & university insights', values: { FREE: false, STARTER: false, PRO: true, PREMIUM: true } },
    ],
  },
  {
    group: 'After admission',
    rows: [
      { label: 'Visa timeline tracking & reminders', values: { FREE: false, STARTER: false, PRO: true, PREMIUM: true }, enforced: true },
    ],
  },
  {
    group: 'Help from people',
    rows: [
      { label: 'SOP & LOR review', values: { FREE: false, STARTER: false, PRO: false, PREMIUM: '2× / month' } },
      { label: '1-on-1 expert consultation', values: { FREE: false, STARTER: false, PRO: false, PREMIUM: true } },
      { label: 'Interview preparation', values: { FREE: false, STARTER: false, PRO: false, PREMIUM: true } },
      { label: 'Support', values: { FREE: 'Community', STARTER: 'Priority', PRO: 'Priority', PREMIUM: '24/7 + success manager' } },
    ],
  },
  {
    group: 'AI tools',
    rows: [{ label: 'AI tools', values: { FREE: 'Limited', STARTER: 'Standard', PRO: 'Advanced', PREMIUM: 'Advanced' }, note: 'Coming soon' }],
  },
];

export interface PlansResponse {
  plans: { plan: Plan; priceBdt: number; maxApplications: number | null; visaTracking: boolean; validityDays: number | null }[];
  gateways: { id: 'bKash' | 'Nagad'; available: boolean }[];
  billing: { currency: string; periodDays: number; autoRenew: boolean };
}
export interface Subscription {
  plan: Plan;
  planExpiresAt: string | null;
  daysLeft: number | null;
  usage: { applications: number; applicationsCap: number | null };
  features: { visaTracking: boolean };
  pendingPayment: { id: string; planPurchased: Plan; paymentGateway: string; amount: number; createdAt: string } | null;
  lastPayment: { planPurchased: Plan; paymentGateway: string; amount: number; createdAt: string } | null;
}

export const perMonth = (yearly: number) => Math.round(yearly / 12);
