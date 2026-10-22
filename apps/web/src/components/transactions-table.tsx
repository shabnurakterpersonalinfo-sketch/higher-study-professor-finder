'use client';

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError, qs, useApi } from '@/lib/api';
import { fmtBdt, fmtDate, fmtTime, PLAN_LABEL, PLAN_ORDER, TX } from '@/lib/format';
import type { Paged, Plan, Transaction, TxStatus } from '@/lib/types';
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, Pagination, Select, Spinner, Textarea } from './ui';

type Summary = { status: TxStatus; count: number; amount: number }[];

export function TransactionsTable({ endpoint, defaultStatus = '', canReconcile }: { endpoint: string; defaultStatus?: string; canReconcile: boolean }) {
  const [status, setStatus] = useState(defaultStatus);
  const [gateway, setGateway] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const key = endpoint + qs({ status, gateway, q: search, from: from && new Date(from).toISOString(), to: to && new Date(to + 'T23:59:59').toISOString(), page });
  const { data, error, loading, reload } = useApi<Paged<Transaction> & { summary: Summary }>(key);
  const [target, setTarget] = useState<Transaction | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => (setSearch(q), setPage(1)), 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-5">
      {data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {(['SUCCESS', 'PENDING', 'FAILED', 'MANUALLY_RECONCILED'] as TxStatus[]).map((s) => {
            const row = data.summary.find((x) => x.status === s);
            return (
              <button key={s} onClick={() => (setStatus(status === s ? '' : s), setPage(1))} className="text-left">
                <Card className={`p-4 ${status === s ? 'border-brand-400 ring-2 ring-brand-100' : ''}`}>
                  <Badge tone={TX[s].tone}>{TX[s].label}</Badge>
                  <p className="mt-2 text-2xl font-semibold">{row?.count ?? 0}</p>
                  <p className="text-xs text-ink-mute">{fmtBdt(row?.amount ?? 0)}</p>
                </Card>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" />
          <Input className="pl-9" placeholder="TrxID or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-44" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
          <option value="">All statuses</option>
          {(Object.keys(TX) as TxStatus[]).map((s) => <option key={s} value={s}>{TX[s].label}</option>)}
        </Select>
        <Select className="w-36" value={gateway} onChange={(e) => (setGateway(e.target.value), setPage(1))}>
          <option value="">All gateways</option><option>bKash</option><option>Nagad</option><option>Rocket</option><option>Manual</option>
        </Select>
        <Input type="date" className="w-40" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} aria-label="From date" />
        <Input type="date" className="w-40" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} aria-label="To date" />
        {canReconcile && <Button className="ml-auto" variant="outline" onClick={() => setOffline(true)}>Record offline payment</Button>}
      </div>
      <ErrorNote error={error} />
      <Card className="overflow-hidden">
        {loading && !data ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-brand-25 text-left text-[13px] font-medium text-ink-mute">
                <tr><th className="px-6 py-3">Date</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Gateway</th><th className="px-4 py-3">TrxID</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last action</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {data?.items.map((t) => (
                  <tr key={t.id}>
                    <td className="px-6 py-3">{fmtDate(t.createdAt)}<br /><span className="text-xs text-ink-mute">{fmtTime(t.createdAt)}</span></td>
                    <td className="px-4 py-3"><p className="font-medium">{t.user?.studentProfile?.fullName ?? '—'}</p><p className="text-ink-mute">{t.user?.email}</p></td>
                    <td className="px-4 py-3">{PLAN_LABEL[t.planPurchased]}</td>
                    <td className="px-4 py-3 font-medium">{fmtBdt(t.amount)}</td>
                    <td className="px-4 py-3">{t.paymentGateway}</td>
                    <td className="px-4 py-3 font-mono text-xs">{t.gatewayTransactionId ?? '—'}</td>
                    <td className="px-4 py-3"><Badge tone={TX[t.status].tone}>{TX[t.status].label}</Badge></td>
                    <td className="max-w-[220px] px-4 py-3 text-xs text-ink-mute">{t.auditLogs?.[0] ? <>{t.auditLogs[0].admin.email}: {t.auditLogs[0].reconciliationNotes}</> : '—'}</td>
                    <td className="px-4 py-3 text-right">{canReconcile && (t.status === 'PENDING' || t.status === 'FAILED') && <Button size="sm" onClick={() => setTarget(t)}>Reconcile</Button>}</td>
                  </tr>
                ))}
                {!data?.items.length && <tr><td colSpan={9} className="px-6 py-12 text-center text-ink-mute">No transactions match.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {data && <div className="border-t border-line px-5"><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} noun="transactions" /></div>}
      </Card>
      {(target || offline) && <ReconcileModal tx={target} onClose={() => (setTarget(null), setOffline(false))} onDone={() => (setTarget(null), setOffline(false), reload())} />}
    </div>
  );
}

function ReconcileModal({ tx, onClose, onDone }: { tx: Transaction | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ referenceId: tx?.gatewayTransactionId ?? '', newStatus: 'MANUALLY_RECONCILED', applyPlan: true, notes: '', userEmail: '', plan: 'STARTER' as Plan, amount: '', paymentGateway: 'bKash' });
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);

  const findUser = async () => {
    const r = await api<Paged<{ id: string; email: string }>>('/admin/users' + qs({ q: f.userEmail, pageSize: 1 }));
    setUser(r.items[0] ?? null);
    if (!r.items[0]) setErr(new ApiError(404, 'No student with that email'));
    else setErr(null);
  };
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('/admin/transactions/manual-reconcile', {
        method: 'POST',
        json: tx
          ? { transactionId: tx.id, referenceId: f.referenceId, newStatus: f.newStatus, applyPlan: f.applyPlan, notes: f.notes }
          : { userId: user?.id, plan: f.plan, amount: Number(f.amount), paymentGateway: f.paymentGateway, referenceId: f.referenceId, newStatus: 'MANUALLY_RECONCILED', applyPlan: f.applyPlan, notes: f.notes },
      });
      onDone();
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  const ready = f.referenceId.length >= 3 && f.notes.length >= 5 && (tx || (user && f.amount));

  return (
    <Modal open onClose={onClose} title={tx ? 'Manual reconciliation' : 'Record offline payment'} subtitle={tx ? `${tx.user?.email} · ${fmtBdt(tx.amount)} via ${tx.paymentGateway} · ${TX[tx.status].label}` : 'For payments made while the gateway was down, or in cash'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!ready}>Save & log</Button></>}>
      <div className="space-y-4">
        <ErrorNote error={err} />
        {!tx && (
          <>
            <Field label="Student email">
              <div className="flex gap-2"><Input value={f.userEmail} onChange={(e) => (setF({ ...f, userEmail: e.target.value }), setUser(null))} /><Button variant="ghost" onClick={findUser}>Find</Button></div>
            </Field>
            {user && <p className="text-sm text-emerald-700">✓ {user.email}</p>}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Plan"><Select value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value as Plan })}>{PLAN_ORDER.filter((p) => p !== 'FREE').map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}</Select></Field>
              <Field label="Amount (BDT)"><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
              <Field label="Method"><Select value={f.paymentGateway} onChange={(e) => setF({ ...f, paymentGateway: e.target.value })}><option>bKash</option><option>Nagad</option><option>Rocket</option><option>Manual</option></Select></Field>
            </div>
          </>
        )}
        <Field label="Gateway TrxID / reference" required hint="Verify it on the bKash/Nagad merchant panel before saving."><Input value={f.referenceId} onChange={(e) => setF({ ...f, referenceId: e.target.value })} /></Field>
        {tx && (
          <Field label="Outcome">
            <Select value={f.newStatus} onChange={(e) => setF({ ...f, newStatus: e.target.value })}>
              <option value="MANUALLY_RECONCILED">Payment verified — mark reconciled</option>
              <option value="FAILED">Payment not found — mark failed</option>
            </Select>
          </Field>
        )}
        {f.newStatus === 'MANUALLY_RECONCILED' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.applyPlan} onChange={(e) => setF({ ...f, applyPlan: e.target.checked })} /> Upgrade the student's plan now</label>}
        <Field label="Notes" required hint="Saved to the transaction audit log."><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. Gateway timeout at 14:02; TrxID confirmed on merchant panel" /></Field>
      </div>
    </Modal>
  );
}
