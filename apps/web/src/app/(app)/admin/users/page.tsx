'use client';

import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card, ErrorNote, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Textarea } from '@/components/ui';
import { api, ApiError, qs, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, PLAN_LABEL, PLAN_ORDER } from '@/lib/format';
import type { Paged, Plan, Role } from '@/lib/types';

interface UserRow {
  id: string;
  email: string;
  role: Role;
  plan: Plan;
  planExpiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  studentProfile: { fullName: string; targetDegree: string; _count: { applications: number; outreachLogs: number } } | null;
}

export default function AdminUsersPage() {
  const { me } = useAuth();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<UserRow> & { planCounts: { plan: Plan; count: number }[] }>('/admin/users' + qs({ q: search, plan, page }));
  const [upgrade, setUpgrade] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);

  useEffect(() => {
    const t = setTimeout(() => (setSearch(q), setPage(1)), 300);
    return () => clearTimeout(t);
  }, [q]);

  const toggleActive = async (u: UserRow) => {
    setErr(null);
    try {
      await api(`/admin/users/${u.id}/status`, { method: 'PATCH', json: { isActive: !u.isActive } });
      reload();
    } catch (e) {
      setErr(e as ApiError);
    }
  };
  const remove = async (u: UserRow) => {
    if (!confirm(`Permanently delete ${u.email} and all their data?`)) return;
    setErr(null);
    try {
      await api(`/admin/users/${u.id}`, { method: 'DELETE' });
      reload();
    } catch (e) {
      setErr(e as ApiError);
    }
  };

  return (
    <div>
      <PageHeader title="User management" subtitle="Search students, change plans, and record offline payments." actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add student</Button>} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" />
          <Input className="pl-9" placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-44" value={plan} onChange={(e) => (setPlan(e.target.value), setPage(1))}>
          <option value="">All plans</option>
          {PLAN_ORDER.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]} ({data?.planCounts.find((c) => c.plan === p)?.count ?? 0})</option>)}
        </Select>
      </div>
      <ErrorNote error={error ?? err} />
      <Card className="overflow-hidden">
        {loading && !data ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-brand-25 text-left text-[13px] font-medium text-ink-mute">
                <tr><th className="px-6 py-3">Student</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">Activity</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {data?.items.map((u) => (
                  <tr key={u.id}>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.studentProfile?.fullName ?? u.email} size={36} />
                        <div><p className="font-medium">{u.studentProfile?.fullName ?? '—'}</p><p className="text-ink-mute">{u.email}</p></div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge tone={u.plan === 'FREE' ? 'gray' : 'indigo'}>{PLAN_LABEL[u.plan]}</Badge></td>
                    <td className="px-4 py-3">{fmtDate(u.planExpiresAt)}</td>
                    <td className="px-4 py-3 text-ink-mute">{u.studentProfile?._count.applications ?? 0} apps · {u.studentProfile?._count.outreachLogs ?? 0} emails</td>
                    <td className="px-4 py-3">{fmtDate(u.createdAt)}</td>
                    <td className="px-4 py-3"><Badge tone={u.isActive ? 'green' : 'red'}>{u.isActive ? 'Active' : 'Disabled'}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => setUpgrade(u)}>Change plan</Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>{u.isActive ? 'Disable' : 'Enable'}</Button>
                        {me?.role === 'SUPER_ADMIN' || u.role === 'GU' ? <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(u)}>Delete</Button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <div className="border-t border-line px-5"><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} noun="users" /></div>}
      </Card>
      {upgrade && <UpgradeModal user={upgrade} onClose={() => setUpgrade(null)} onDone={() => (setUpgrade(null), reload())} />}
      <CreateModal open={creating} onClose={() => setCreating(false)} onDone={() => (setCreating(false), reload())} />
    </div>
  );
}

function UpgradeModal({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<{ plan: Plan; record: boolean; paymentGateway: string; amount: string; referenceId: string; notes: string }>({ plan: user.plan === 'FREE' ? 'STARTER' : user.plan, record: false, paymentGateway: 'bKash', amount: '', referenceId: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/users/${user.id}/upgrade`, {
        method: 'PATCH',
        json: { plan: f.plan, notes: f.notes, ...(f.record && { paymentGateway: f.paymentGateway, amount: Number(f.amount), referenceId: f.referenceId || undefined }) },
      });
      onDone();
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Change subscription plan" subtitle={user.email}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={f.notes.length < 3 || (f.record && !f.amount)}>Apply</Button></>}>
      <div className="space-y-4">
        <ErrorNote error={err} />
        <Field label="New plan">
          <Select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value as Plan })}>
            {PLAN_ORDER.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.record} onChange={(e) => setF({ ...f, record: e.target.checked })} /> Record an offline / manual payment</label>
        {f.record && (
          <div className="grid gap-4 rounded-xl bg-canvas p-4 sm:grid-cols-3">
            <Field label="Method"><Select value={f.paymentGateway} onChange={(e) => setF({ ...f, paymentGateway: e.target.value })}><option>bKash</option><option>Nagad</option><option>Rocket</option><option>Manual</option></Select></Field>
            <Field label="Amount (BDT)"><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="TrxID / ref"><Input value={f.referenceId} onChange={(e) => setF({ ...f, referenceId: e.target.value })} /></Field>
          </div>
        )}
        <Field label="Reason" required hint="Saved to the audit trail."><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. Paid in cash at the office, receipt #1042" /></Field>
      </div>
    </Modal>
  );
}

function CreateModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ fullName: '', email: '', password: '', plan: 'FREE' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('/admin/users', { method: 'POST', json: f });
      setF({ fullName: '', email: '', password: '', plan: 'FREE' });
      onDone();
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add student" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Create</Button></>}>
      <div className="space-y-4">
        <ErrorNote error={err} />
        <Field label="Full name"><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Temporary password" hint="At least 8 characters. Ask the student to change it."><Input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Plan"><Select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>{PLAN_ORDER.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}</Select></Field>
      </div>
    </Modal>
  );
}
