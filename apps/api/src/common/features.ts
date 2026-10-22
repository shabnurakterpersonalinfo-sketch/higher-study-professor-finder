import { SubscriptionPlan } from '@prisma/client';
import { planRank } from './plans';

/**
 * Feature releases students are told about with a "New" highlight on the menu.
 * Ship an entry here together with the feature, and add a matching tour in
 * apps/web/src/lib/tours.ts under `feature:<id>`.
 *
 * Who sees it (once, until they open it or dismiss it):
 * - `minPlan` above FREE → anyone whose plan includes it ("Unlocked with Pro").
 *   Everyone starts on Free, so a paid feature is always new to its owner.
 * - `minPlan` FREE → accounts created before `releasedAt` ("New"). People who
 *   sign up later meet it in the regular first-visit tour instead.
 */
export interface FeatureRelease {
  id: string;
  title: string;
  body: string;
  /** Web route of the menu item to highlight. */
  href: string;
  minPlan: SubscriptionPlan;
  releasedAt: string; // ISO date
}

export const FEATURES: FeatureRelease[] = [
  {
    id: 'visa-reminders',
    title: 'Visa reminders',
    body: 'Add your visa appointment, bank solvency and passport dates — we remind you 14, 7 and 1 day before each one.',
    href: '/visa',
    minPlan: 'PRO',
    releasedAt: '2026-06-01',
  },
  {
    id: 'unlimited-applications',
    title: 'No application limit',
    body: 'Track as many programs as you like. Each one gets its own document checklist and deadline alert.',
    href: '/applications',
    minPlan: 'PRO',
    releasedAt: '2026-06-01',
  },
  {
    id: 'outreach-export',
    title: 'Export your email tracker',
    body: 'Download every professor thread — dates, replies and follow-ups — as a CSV for your records.',
    href: '/email-tracker',
    minPlan: 'FREE',
    releasedAt: '2026-10-20',
  },
  {
    id: 'plan-compare',
    title: 'Compare plans side by side',
    body: 'See what each plan includes, what you are using today, and what changes before you pay.',
    href: '/purchase-plan',
    minPlan: 'FREE',
    releasedAt: '2026-10-22',
  },
];

export const FEATURE_IDS = new Set(FEATURES.map((f) => f.id));

export type FeatureReason = 'NEW' | 'UNLOCKED';

/** Features to highlight for this student right now. */
export function featuresFor(user: { plan: SubscriptionPlan; createdAt: Date; featuresSeen: string[] }) {
  const seen = new Set(user.featuresSeen);
  return FEATURES.flatMap((f) => {
    if (seen.has(f.id) || planRank(user.plan) < planRank(f.minPlan)) return [];
    if (f.minPlan !== 'FREE') return [{ ...f, reason: 'UNLOCKED' as FeatureReason }];
    if (new Date(f.releasedAt) > user.createdAt) return [{ ...f, reason: 'NEW' as FeatureReason }];
    return [];
  });
}
