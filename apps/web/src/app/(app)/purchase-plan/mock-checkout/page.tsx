'use client';

import { FlaskConical } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button, Card, Spinner } from '@/components/ui';
import { fmtBdt } from '@/lib/format';

/**
 * Development-only stand-in for the bKash/Nagad hosted checkout (PAYMENT_MODE=mock).
 * It sends the browser back to the API callback exactly as the real gateway would.
 * The API refuses to start with PAYMENT_MODE=mock in production.
 */
function Inner() {
  const p = useSearchParams();
  const paymentID = p.get('paymentID') ?? '';
  const callback = p.get('callback') ?? '';
  const amount = Number(p.get('amount') ?? 0);
  const go = (status: string) => {
    const u = new URL(callback);
    u.searchParams.set('paymentID', paymentID);
    u.searchParams.set('status', status);
    window.location.href = u.toString();
  };
  return (
    <div className="mx-auto mt-10 max-w-md">
      <Card className="p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-600"><FlaskConical className="h-6 w-6" /></span>
        <h1 className="mt-4 text-xl font-semibold">Test checkout</h1>
        <p className="mt-1 text-sm text-ink-mute">Development mode — no real money moves.</p>
        <p className="mt-6 text-3xl font-semibold text-brand-600">{fmtBdt(amount)}</p>
        <p className="mt-1 font-mono text-xs text-ink-faint">{paymentID}</p>
        <div className="mt-8 grid gap-3">
          <Button size="lg" onClick={() => go('success')}>Simulate successful payment</Button>
          <Button size="lg" variant="ghost" onClick={() => go('failure')}>Simulate failure</Button>
          <Button size="lg" variant="ghost" onClick={() => go('cancel')}>Cancel</Button>
        </div>
      </Card>
    </div>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Inner />
    </Suspense>
  );
}
