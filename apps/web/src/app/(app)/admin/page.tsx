'use client';

import { AlertTriangle, Banknote, Clock, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge, Button, Card, ErrorNote, PageHeader, Spinner, StatCard } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtBdt, PLAN_LABEL, PLAN_ORDER } from '@/lib/format';
import type { Plan } from '@/lib/types';

interface Overview {
  totalStudents: number;
  byPlan: { plan: Plan; count: number }[];
  revenueThisMonthBdt: number;
  pendingTransactions: number;
  failedLast7Days: number;
}

export default function AdminOverviewPage() {
  const { me } = useAuth();
  const { data, error, loading } = useApi<Overview>('/admin/overview');
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;
  const max = Math.max(1, ...data.byPlan.map((p) => p.count));
  return (
    <div className="space-y-6">
      <PageHeader title="Admin overview" subtitle={`Signed in as ${me?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Users className="h-5 w-5" />} label="Students" value={data.totalStudents.toLocaleString()} />
        <StatCard icon={<Banknote className="h-5 w-5" />} tone="green" label="Revenue this month" value={fmtBdt(data.revenueThisMonthBdt)} sub="Success + reconciled" />
        <StatCard icon={<Clock className="h-5 w-5" />} tone="amber" label="Pending payments" value={data.pendingTransactions} sub="Awaiting gateway or review" />
        <StatCard icon={<AlertTriangle className="h-5 w-5" />} tone="red" label="Failed (7 days)" value={data.failedLast7Days} sub="Check for gateway downtime" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-5 font-semibold">Students by plan</h2>
          <ul className="space-y-4">
            {PLAN_ORDER.map((p) => {
              const n = data.byPlan.find((b) => b.plan === p)?.count ?? 0;
              return (
                <li key={p}>
                  <div className="mb-1 flex justify-between text-sm"><span>{PLAN_LABEL[p]}</span><span className="font-semibold">{n}</span></div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${(n / max) * 100}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Quick actions</h2>
          <div className="space-y-3">
            <Link href="/admin/transactions" className="flex items-center justify-between rounded-xl border border-line p-4 hover:border-brand-200">
              <span>Reconcile failed or offline payments</span>
              {data.pendingTransactions + data.failedLast7Days > 0 && <Badge tone="amber">{data.pendingTransactions + data.failedLast7Days} need review</Badge>}
            </Link>
            <Link href="/admin/users" className="block rounded-xl border border-line p-4 hover:border-brand-200">Find a student and change their plan</Link>
            <Link href="/admin/directory" className="block rounded-xl border border-line p-4 hover:border-brand-200">Update universities and professors</Link>
            {me?.role === 'SUPER_ADMIN' && <Link href="/superadmin/audit-logs"><Button variant="secondary" className="w-full">Open audit trail</Button></Link>}
          </div>
        </Card>
      </div>
    </div>
  );
}
