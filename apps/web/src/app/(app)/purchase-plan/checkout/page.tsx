'use client';

import { ArrowLeft, Check, Lock } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, cx, ErrorNote, Spinner } from '@/components/ui';
import { api, ApiError, useApi } from '@/lib/api';
import { fmtDate, PLAN_ORDER } from '@/lib/format';
import { perMonth, PLAN_COPY, PlansResponse, Subscription } from '@/lib/plans';
import type { Plan } from '@/lib/types';

const bdt = (n: number) => n.toLocaleString('en-US');

/** Brand marks drawn as text, in each wallet's colour — no third-party logos bundled. */
const WALLET: Record<'bKash' | 'Nagad', { color: string; note: string }> = {
  bKash: { color: '#E2136E', note: 'Approve with your bKash PIN and OTP' },
  Nagad: { color: '#EC1C24', note: 'Approve with your Nagad PIN and OTP' },
};

function Inner() {
  const plan = (useSearchParams().get('plan') ?? '').toUpperCase() as Plan;
  const { data: sub } = useApi<Subscription>('/payments/subscription');
  const { data: catalog } = useApi<PlansResponse>('/payments/plans');
  const [gateway, setGateway] = useState<'bKash' | 'Nagad'>('bKash');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);

  if (!sub || !catalog) return <Spinner />;
  const copy = PLAN_COPY[plan];
  const spec = catalog.plans.find((p) => p.plan === plan);
  const valid = copy && spec && PLAN_ORDER.indexOf(plan) > PLAN_ORDER.indexOf(sub.plan);

  if (!valid) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-2xl font-semibold">{copy ? `You already have ${copy.name} or higher` : 'Choose a plan first'}</h1>
        <p className="mt-2 text-ink-soft">Pick a plan above your current one to continue.</p>
        <Link href="/purchase-plan" className="mt-6 inline-block"><Button>See plans</Button></Link>
      </div>
    );
  }

  const available = catalog.gateways.filter((g) => g.available).map((g) => g.id);
  const method = available.includes(gateway) ? gateway : available[0];
  const accessUntil = new Date(Date.now() + catalog.billing.periodDays * 86_400_000);
  const cap = sub.usage.applicationsCap;
  const newCap = spec.maxApplications;

  const pay = async () => {
    if (!method) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ redirectUrl: string }>('/payments/checkout', { method: 'POST', json: { plan, gateway: method } });
      window.location.href = r.redirectUrl;
    } catch (e) {
      setErr(e as ApiError);
      setBusy(false);
    }
  };

  // What actually changes for this student, computed from their usage and the plan limits.
  const changes: string[] = [];
  if (cap != null && newCap == null) changes.push(`No application limit (you track ${sub.usage.applications} today, your limit is ${cap})`);
  else if (cap != null && newCap != null && newCap > cap) changes.push(`Track up to ${newCap} applications instead of ${cap}`);
  if (!sub.features.visaTracking && spec.visaTracking) changes.push('Visa timeline tracking and reminders');

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <Link href="/purchase-plan" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All plans
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_400px]">
        <section>
          <h1 className="text-[40px] font-semibold leading-tight tracking-tight">Upgrade to {copy.name}</h1>
          <p className="mt-2 text-[17px] text-ink-soft">{copy.tagline}.</p>

          {changes.length > 0 && (
            <div className="mt-8">
              <h2 className="text-[15px] font-medium text-ink">What changes for you right away</h2>
              <ul className="mt-3 space-y-2.5">
                {changes.map((c) => (
                  <li key={c} className="flex gap-2.5 text-[15px] text-ink"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{c}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8">
            <h2 className="text-[15px] font-medium text-ink">{copy.includesLabel}</h2>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {copy.highlights.map((h) => (
                <li key={h} className="flex gap-2.5 text-[15px] text-ink-soft"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{h}</li>
              ))}
            </ul>
          </div>

          {sub.plan !== 'FREE' && sub.planExpiresAt && (
            <p className="mt-8 rounded-xl bg-canvas px-4 py-3 text-sm text-ink-soft">
              Your {PLAN_COPY[sub.plan].name} plan runs until {fmtDate(sub.planExpiresAt)}. {copy.name} replaces it today and runs for 12 months from now — the remaining time isn’t credited.
            </p>
          )}
        </section>

        <aside className="h-fit rounded-3xl border border-line bg-white p-6 lg:sticky lg:top-24">
          <h2 className="font-semibold">Order summary</h2>
          <dl className="mt-4 space-y-3 text-[15px]">
            <div className="flex justify-between"><dt className="text-ink-soft">{copy.name} plan, 12 months</dt><dd className="tabular-nums">{bdt(spec.priceBdt)} BDT</dd></div>
            <div className="flex justify-between text-sm"><dt className="text-ink-mute">Works out to</dt><dd className="text-ink-mute tabular-nums">{bdt(perMonth(spec.priceBdt))} BDT a month</dd></div>
            <div className="flex justify-between text-sm"><dt className="text-ink-mute">Access until</dt><dd className="text-ink-mute">{fmtDate(accessUntil)}</dd></div>
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="font-medium">Due today</span>
            <span className="text-2xl font-semibold tabular-nums">{bdt(spec.priceBdt)} BDT</span>
          </div>
          <p className="mt-1 text-xs text-ink-mute">One payment. Doesn’t renew automatically.</p>

          <fieldset className="mt-6">
            <legend className="text-sm font-medium">Pay with</legend>
            <div className="mt-2 space-y-2">
              {catalog.gateways.map((g) => (
                <label
                  key={g.id}
                  className={cx(
                    'flex items-center gap-3 rounded-xl border px-4 py-3',
                    !g.available ? 'cursor-not-allowed border-line opacity-60' : method === g.id ? 'cursor-pointer border-brand-500 ring-2 ring-brand-100' : 'cursor-pointer border-line hover:border-brand-200',
                  )}
                >
                  <input type="radio" name="gw" className="sr-only" disabled={!g.available} checked={method === g.id} onChange={() => setGateway(g.id)} />
                  <span className={cx('grid h-5 w-5 place-items-center rounded-full border-2', method === g.id ? 'border-brand-600' : 'border-slate-300')}>
                    {method === g.id && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold" style={{ color: WALLET[g.id].color }}>{g.id}</span>
                    <span className="block text-xs text-ink-mute">{g.available ? WALLET[g.id].note : 'Not available yet'}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4"><ErrorNote error={err} /></div>
          <Button size="lg" className="mt-4 w-full" onClick={pay} loading={busy} disabled={!method}>
            Pay {bdt(spec.priceBdt)} BDT with {method}
          </Button>
          <p className="mt-3 flex items-start gap-2 text-xs text-ink-mute">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            You’ll approve the payment on {method}’s page, then come back here. HigherStudy never sees your PIN.
          </p>
        </aside>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Inner />
    </Suspense>
  );
}
