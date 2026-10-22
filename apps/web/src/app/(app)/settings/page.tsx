'use client';

import { Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SecuritySettings } from '@/components/security-settings';
import { Badge, Button, Card, PageHeader, Spinner, useToast } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOnboarding } from '@/lib/onboarding';
import { fmtBdt, fmtDate, PLAN_LABEL, TX } from '@/lib/format';
import type { Transaction } from '@/lib/types';

export default function SettingsPage() {
  const { me } = useAuth();
  const { data: history } = useApi<Transaction[]>(me?.role === 'GU' ? '/payments/history' : null);
  const { resetTours } = useOnboarding();
  const toast = useToast();
  const [resetting, setResetting] = useState(false);
  if (!me) return <Spinner />;
  const showTipsAgain = async () => {
    setResetting(true);
    await resetTours().catch(() => null);
    setResetting(false);
    toast('Tips are back on. Each screen will show its tour next time you open it.');
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle={me.role === 'GU' ? 'Account, security, plan and billing history.' : 'Account and security.'} />
      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Account</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-ink-mute">Email</dt><dd className="mt-1 font-medium">{me.email}</dd></div>
          {me.role === 'GU' ? (
            <div><dt className="text-ink-mute">Plan</dt><dd className="mt-1 flex items-center gap-2"><Badge tone="indigo">{PLAN_LABEL[me.plan]}</Badge><Link href="/purchase-plan" className="text-sm font-medium text-brand-600 hover:text-brand-700">Manage</Link></dd></div>
          ) : (
            <div><dt className="text-ink-mute">Role</dt><dd className="mt-1"><Badge tone="violet">{me.role === 'SUPER_ADMIN' ? 'Super admin' : 'Admin'}</Badge></dd></div>
          )}
          <div><dt className="text-ink-mute">Notifications</dt><dd className="mt-1 text-ink-soft">Email + in-app (follow-ups and visa milestones)</dd></div>
        </dl>

      </Card>
      <SecuritySettings />
      {me.role === 'GU' && (
        <Card className="flex flex-wrap items-center gap-4 p-6" data-tour="settings-tips">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-50 text-amber-600"><Lightbulb className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Screen tours</h2>
            <p className="mt-0.5 text-sm text-ink-mute">Show the short guided tour again on every screen. You can also press the ? button at the top of any screen.</p>
          </div>
          <Button variant="ghost" onClick={showTipsAgain} loading={resetting}>Show tips again</Button>
        </Card>
      )}
      {me.role === 'GU' && <Card className="overflow-hidden">
        <h2 className="px-6 pt-6 font-semibold">Billing history</h2>
        <table className="mt-4 w-full text-sm">
          <thead className="bg-brand-25 text-left text-[13px] font-medium text-ink-mute">
            <tr><th className="px-6 py-3">Date</th><th className="px-6 py-3">Plan</th><th className="px-6 py-3">Amount</th><th className="px-6 py-3">Method</th><th className="px-6 py-3">Reference</th><th className="px-6 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {history?.map((t) => (
              <tr key={t.id}>
                <td className="px-6 py-3">{fmtDate(t.createdAt)}</td>
                <td className="px-6 py-3">{PLAN_LABEL[t.planPurchased]}</td>
                <td className="px-6 py-3">{fmtBdt(t.amount)}</td>
                <td className="px-6 py-3">{t.paymentGateway}</td>
                <td className="px-6 py-3 font-mono text-xs">{t.gatewayTransactionId ?? '—'}</td>
                <td className="px-6 py-3"><Badge tone={TX[t.status].tone}>{TX[t.status].label}</Badge></td>
              </tr>
            ))}
            {!history?.length && <tr><td colSpan={6} className="px-6 py-8 text-center text-ink-mute">No payments yet.</td></tr>}
          </tbody>
        </table>
      </Card>}
    </div>
  );
}
