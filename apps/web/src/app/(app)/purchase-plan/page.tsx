'use client';

import { Check, ChevronDown, Clock, Minus, PartyPopper, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { Button, cx, Spinner } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, PLAN_ORDER } from '@/lib/format';
import { COMPARE, perMonth, PLAN_COPY, PlansResponse, Subscription } from '@/lib/plans';
import type { Plan } from '@/lib/types';

const bdt = (n: number) => n.toLocaleString('en-US');

/** The next tier up, with the reason that matters for this student right now. */
function recommendation(sub: Subscription): { plan: Plan; reason: string } | null {
  const i = PLAN_ORDER.indexOf(sub.plan);
  if (i >= PLAN_ORDER.length - 1) return null;
  const next = PLAN_ORDER[i + 1];
  const { applications, applicationsCap: cap } = sub.usage;
  if (cap != null && applications >= cap) return { plan: next, reason: `You've reached your ${cap}-application limit` };
  if (cap != null && applications >= cap * 0.8) return { plan: next, reason: `You've used ${applications} of ${cap} applications` };
  if (next === 'PRO') return { plan: next, reason: 'Adds visa tracking for after you get your offer' };
  if (next === 'STARTER') return { plan: next, reason: 'Room for a full shortlist of 20 programs' };
  return { plan: next, reason: 'Adds reviews and coaching from experts' };
}

function Inner() {
  const { refresh } = useAuth();
  const router = useRouter();
  const result = useSearchParams().get('result');
  const { data: sub, reload } = useApi<Subscription>('/payments/subscription');
  const { data: catalog } = useApi<PlansResponse>('/payments/plans');

  useEffect(() => {
    if (result === 'success') (refresh(), reload());
  }, [result, refresh, reload]);

  if (!sub || !catalog) return <Spinner />;
  const current = PLAN_ORDER.indexOf(sub.plan);
  const rec = recommendation(sub);
  const price = (p: Plan) => catalog.plans.find((x) => x.plan === p)?.priceBdt ?? 0;
  const cap = sub.usage.applicationsCap;
  const used = sub.usage.applications;

  return (
    <div className="mx-auto max-w-6xl pb-16">
      {result === 'success' ? (
        <section className="mb-10 rounded-3xl bg-[#1E1B4B] p-8 text-white sm:p-10">
          <PartyPopper className="h-8 w-8 text-brand-200" />
          <h1 className="mt-4 text-[40px] font-semibold leading-tight tracking-tight">You're on {PLAN_COPY[sub.plan].name} now</h1>
          <p className="mt-2 max-w-xl text-brand-100">
            Payment confirmed.{sub.planExpiresAt ? ` Your plan is active until ${fmtDate(sub.planExpiresAt)}.` : ''} Here's what just unlocked:
          </p>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {PLAN_COPY[sub.plan].highlights.map((h) => (
              <li key={h} className="flex items-center gap-2 text-[15px]"><Check className="h-4 w-4 text-emerald-300" /> {h}</li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard"><Button size="lg" variant="inverse">Go to dashboard</Button></Link>
            {sub.features.visaTracking && <Link href="/visa"><Button size="lg" variant="inverseGhost">Open visa reminders</Button></Link>}
          </div>
        </section>
      ) : (
        <header className="mb-10 grid gap-8 lg:grid-cols-[1fr_380px] lg:items-end">
          <div>
            <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-ink">Plans that grow with your search</h1>
            <p className="mt-3 max-w-xl text-[17px] text-ink-soft">Start free, then upgrade when your shortlist gets longer or your offer letter arrives. One payment covers 12 months.</p>
          </div>
          <div className="rounded-2xl border border-line-soft bg-white p-5" data-tour="plan-current">
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-ink-mute">Your plan</p>
              <p className="text-sm text-ink-mute">{sub.planExpiresAt ? `Until ${fmtDate(sub.planExpiresAt)}` : 'No end date'}</p>
            </div>
            <p className="mt-1 text-2xl font-semibold">{PLAN_COPY[sub.plan].name}</p>
            <div className="mt-4">
              <div className="flex justify-between text-sm">
                <span className="text-ink-soft">Applications</span>
                <span className="tabular-nums text-ink">{cap == null ? `${used} tracked · no limit` : `${used} of ${cap}`}</span>
              </div>
              {cap != null && (
                <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={used} aria-valuemax={cap}>
                  <div className={cx('h-2 rounded-full', used >= cap ? 'bg-red-500' : used >= cap * 0.8 ? 'bg-amber-500' : 'bg-brand-600')} style={{ width: `${Math.min(100, (used / cap) * 100)}%` }} />
                </div>
              )}
            </div>
            <p className="mt-3 text-sm text-ink-soft">Visa tracking {sub.features.visaTracking ? <span className="text-emerald-700">included</span> : <span className="text-ink-mute">not included</span>}</p>
          </div>
        </header>
      )}

      {result && result !== 'success' && (
        <div className={cx('mb-8 rounded-2xl border px-5 py-4 text-[15px]', result === 'pending' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-line bg-white text-ink-soft')}>
          {result === 'pending'
            ? 'We couldn’t confirm the payment with the gateway yet. If money left your account, keep the transaction ID from your SMS — an admin will verify it and apply your plan.'
            : result === 'cancelled'
              ? 'Payment cancelled. Your plan hasn’t changed.'
              : 'The payment didn’t go through and you weren’t charged. Try again, or choose another payment method.'}
        </div>
      )}
      {sub.pendingPayment && result !== 'success' && (
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-[15px] text-amber-900">
          <Clock className="mt-0.5 h-5 w-5 shrink-0" />
          Your {sub.pendingPayment.paymentGateway} payment for {PLAN_COPY[sub.pendingPayment.planPurchased].name} on {fmtDate(sub.pendingPayment.createdAt)} is still being confirmed. You don’t need to pay again.
        </div>
      )}

      {/* plans */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-tour="plan-cards">
        {PLAN_ORDER.map((p, i) => {
          const copy = PLAN_COPY[p];
          const isCurrent = i === current;
          const below = i < current;
          const featured = rec?.plan === p;
          const amount = price(p);
          return (
            <article
              key={p}
              className={cx(
                'relative flex flex-col rounded-3xl p-6',
                featured ? 'bg-[#1E1B4B] text-white shadow-pop' : 'border border-line-soft bg-white',
                isCurrent && !featured && 'ring-2 ring-brand-200',
              )}
            >
              <div className="flex min-h-[28px] items-center justify-between">
                <h2 className="text-xl font-semibold">{copy.name}</h2>
                {isCurrent && <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">Your plan</span>}
                {featured && <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-brand-100"><Sparkles className="h-3 w-3" /> Recommended</span>}
              </div>
              <p className={cx('mt-1 text-[15px]', featured ? 'text-brand-100' : 'text-ink-soft')}>{copy.tagline}</p>

              <div className="mt-6">
                {amount === 0 ? (
                  <p className="text-[40px] font-semibold leading-none tracking-tight">Free</p>
                ) : (
                  <p className="flex items-baseline gap-1.5">
                    <span className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">{bdt(amount)}</span>
                    <span className={cx('text-sm', featured ? 'text-brand-200' : 'text-ink-mute')}>BDT / year</span>
                  </p>
                )}
                <p className={cx('mt-2 min-h-[2.5rem] text-sm', featured ? 'text-brand-200' : 'text-ink-mute')}>{amount ? `About ${bdt(perMonth(amount))} BDT a month, paid once` : 'Always free'}</p>
              </div>

              {featured && rec && <p className="mt-4 rounded-xl bg-white/10 px-3 py-2 text-sm text-white">{rec.reason}</p>}

              <div className="mt-5">
                {isCurrent ? (
                  <p className={cx('flex h-12 w-full items-center justify-center rounded-lg text-[15px] font-medium', featured ? 'bg-white/10 text-white' : 'bg-brand-50 text-brand-700')}>Your current plan</p>
                ) : below ? (
                  <p className="flex h-12 w-full items-center justify-center rounded-lg border border-line text-[15px] text-ink-mute">Included in your plan</p>
                ) : (
                  <Button size="lg" className="w-full" variant={featured ? 'inverse' : 'outline'} onClick={() => router.push(`/purchase-plan/checkout?plan=${p}`)}>
                    Upgrade to {copy.name}
                  </Button>
                )}
              </div>

              <p className={cx('mt-6 text-sm font-medium', featured ? 'text-white' : 'text-ink')}>{copy.includesLabel}:</p>
              <ul className="mt-3 space-y-2.5">
                {copy.highlights.map((h) => (
                  <li key={h} className={cx('flex gap-2.5 text-[15px] leading-snug', featured ? 'text-brand-50' : 'text-ink-soft')}>
                    <Check className={cx('mt-0.5 h-4 w-4 shrink-0', featured ? 'text-emerald-300' : 'text-brand-600')} />
                    {h}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-ink-mute">
        Pay once in BDT with {catalog.gateways.filter((g) => g.available).map((g) => g.id).join(' or ')}. Plans last 12 months and don’t renew automatically — when one ends, your account moves to Free and keeps all your data.
      </p>

      {/* compare */}
      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">Compare plans</h2>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line-soft bg-white" data-tour="plan-compare">
          <table className="w-full min-w-[720px] text-[15px]">
            <thead>
              <tr className="border-b border-line">
                <th className="w-[34%] px-6 py-4 text-left font-normal text-ink-mute">Feature</th>
                {PLAN_ORDER.map((p) => (
                  <th key={p} className={cx('px-4 py-4 text-left font-semibold', p === sub.plan && 'text-brand-700')}>
                    {PLAN_COPY[p].name}
                    {p === sub.plan && <span className="ml-1.5 text-xs font-normal">(yours)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            {COMPARE.map((g) => (
              <tbody key={g.group}>
                <tr><td colSpan={5} className="bg-canvas px-6 py-2.5 text-sm font-medium text-ink-soft">{g.group}</td></tr>
                {g.rows.map((r) => (
                  <tr key={r.label} className="border-t border-line">
                    <td className="px-6 py-3 text-ink">
                      {r.label}
                      {r.note && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-ink-mute">{r.note}</span>}
                    </td>
                    {PLAN_ORDER.map((p) => {
                      const v = r.values[p];
                      return (
                        <td key={p} className={cx('px-4 py-3', p === sub.plan && 'bg-brand-50/40')}>
                          {v === true ? <Check className="h-4 w-4 text-brand-600" aria-label="Included" /> : v === false ? <Minus className="h-4 w-4 text-slate-300" aria-label="Not included" /> : <span className="text-ink-soft">{v}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      {/* faq */}
      <section className="mt-16 grid gap-8 lg:grid-cols-[280px_1fr]">
        <h2 className="text-2xl font-semibold tracking-tight">Questions about billing</h2>
        <div className="divide-y divide-line-soft border-y border-line">
          {[
            ['How do I pay?', `In BDT with ${catalog.gateways.filter((g) => g.available).map((g) => g.id).join(' or ')}. You approve the payment on the gateway’s own page — HigherStudy never sees your PIN.`],
            ['Does my plan renew automatically?', 'No. One payment covers 12 months from the day it’s confirmed. After that your account moves to Free; your applications, outreach history and notes stay, and you can upgrade again any time.'],
            ['Can I move from Starter to Pro later?', 'Yes. You pay the Pro price and your 12 months restart from that day. Time left on your current plan isn’t credited, so upgrading early in a plan costs more than upgrading near its end.'],
            ['My payment went through, but my plan didn’t change', 'Sometimes the gateway confirms the payment after we stop waiting. It then shows as pending on this page. An admin checks the transaction ID with bKash or Nagad and applies your plan — you don’t need to pay twice.'],
            ['What happens to my visa reminders if my plan ends?', 'They’re kept. Visa tracking is part of Pro and Premium, so the reminders are hidden while you’re on Free or Starter and come back when you upgrade.'],
          ].map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-medium text-ink">
                {q}
                <ChevronDown className="h-5 w-5 shrink-0 text-ink-faint transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function PurchasePlanPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Inner />
    </Suspense>
  );
}
