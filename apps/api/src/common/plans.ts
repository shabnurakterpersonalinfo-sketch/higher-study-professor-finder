import { SubscriptionPlan } from '@prisma/client';

export const PLAN_ORDER: SubscriptionPlan[] = ['FREE', 'STARTER', 'PRO', 'PREMIUM'];

export const planRank = (p: SubscriptionPlan) => PLAN_ORDER.indexOf(p);

/** Matches the Purchase Plan screen. Prices in BDT. */
export const PLANS: Record<
  SubscriptionPlan,
  { priceBdt: number; maxApplications: number | null; visaTracking: boolean; validityDays: number | null }
> = {
  FREE: { priceBdt: 0, maxApplications: 3, visaTracking: false, validityDays: null },
  STARTER: { priceBdt: 2000, maxApplications: 20, visaTracking: false, validityDays: 365 },
  PRO: { priceBdt: 5000, maxApplications: null, visaTracking: true, validityDays: 365 },
  PREMIUM: { priceBdt: 10000, maxApplications: null, visaTracking: true, validityDays: 365 },
};
