'use client';

import { useState } from 'react';
import { Badge, Card, cx, ErrorNote, PageHeader, Pagination, Select, Spinner } from '@/components/ui';
import { qs, useApi } from '@/lib/api';
import { fmtBdt, fmtDate, fmtTime, TX } from '@/lib/format';
import type { Paged, TxStatus } from '@/lib/types';

interface ActionLog {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
  admin: { email: string; role: string };
}
interface ReconLog {
  id: string;
  previousStatus: TxStatus;
  newStatus: TxStatus;
  referenceId: string | null;
  reconciliationNotes: string;
  timestamp: string;
  admin: { email: string };
  transaction: { id: string; amount: number; paymentGateway: string; planPurchased: string; user: { email: string } };
}

const ACTIONS = ['USER_CREATED', 'USER_PLAN_CHANGED', 'USER_ROLE_CHANGED', 'USER_DISABLED', 'USER_ENABLED', 'USER_DELETED', 'TX_RECONCILED', 'UNIVERSITY_UPSERTED', 'UNIVERSITY_DELETED', 'PROFESSOR_UPSERTED', 'PROFESSOR_DELETED'];
const diff = (v: unknown) => (v ? JSON.stringify(v).replace(/[{}"]/g, '').replace(/,/g, ', ').slice(0, 120) : '—');

export default function AuditLogsPage() {
  const [tab, setTab] = useState<'actions' | 'recon'>('actions');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const actions = useApi<Paged<ActionLog>>(tab === 'actions' ? '/superadmin/audit-logs' + qs({ action, page }) : null);
  const recon = useApi<Paged<ReconLog>>(tab === 'recon' ? '/superadmin/reconciliation-logs' + qs({ page }) : null);
  const cur = tab === 'actions' ? actions : recon;

  return (
    <div>
      <PageHeader title="Audit trail" subtitle="Every administrative change and payment intervention, newest first." />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <div className="flex gap-6">
          {([['actions', 'Admin actions'], ['recon', 'Payment reconciliations']] as const).map(([k, l]) => (
            <button key={k} onClick={() => (setTab(k), setPage(1))} className={cx('-mb-px border-b-2 pb-3', tab === k ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-ink-mute')}>{l}</button>
          ))}
        </div>
        {tab === 'actions' && (
          <Select className="mb-2 w-56" value={action} onChange={(e) => (setAction(e.target.value), setPage(1))}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ').toLowerCase()}</option>)}
          </Select>
        )}
      </div>
      <ErrorNote error={cur.error} />
      <Card className="overflow-hidden">
        {cur.loading && !cur.data ? <Spinner /> : (
          <div className="overflow-x-auto">
            {tab === 'actions' ? (
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-brand-25 text-left text-[13px] font-medium text-ink-mute"><tr><th className="px-6 py-3">When</th><th className="px-4 py-3">Admin</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Before</th><th className="px-4 py-3">After</th></tr></thead>
                <tbody className="divide-y divide-line-soft">
                  {actions.data?.items.map((l) => (
                    <tr key={l.id}>
                      <td className="px-6 py-3">{fmtDate(l.createdAt)}<br /><span className="text-xs text-ink-mute">{fmtTime(l.createdAt)}</span></td>
                      <td className="px-4 py-3">{l.admin.email}<br /><span className="text-xs text-ink-mute">{l.admin.role}</span></td>
                      <td className="px-4 py-3"><Badge tone={l.action.includes('DELETE') || l.action.includes('DISABLED') ? 'red' : l.action.startsWith('TX') ? 'indigo' : 'blue'}>{l.action.replace(/_/g, ' ')}</Badge></td>
                      <td className="px-4 py-3 text-xs"><span className="text-ink-mute">{l.targetType}</span><br /><span className="font-mono">{l.targetId.slice(0, 8)}…</span></td>
                      <td className="max-w-[220px] px-4 py-3 text-xs text-ink-mute">{diff(l.before)}</td>
                      <td className="max-w-[220px] px-4 py-3 text-xs">{diff(l.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-brand-25 text-left text-[13px] font-medium text-ink-mute"><tr><th className="px-6 py-3">When</th><th className="px-4 py-3">Admin</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Change</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Notes</th></tr></thead>
                <tbody className="divide-y divide-line-soft">
                  {recon.data?.items.map((l) => (
                    <tr key={l.id}>
                      <td className="px-6 py-3">{fmtDate(l.timestamp)}<br /><span className="text-xs text-ink-mute">{fmtTime(l.timestamp)}</span></td>
                      <td className="px-4 py-3">{l.admin.email}</td>
                      <td className="px-4 py-3">{l.transaction.user.email}</td>
                      <td className="px-4 py-3">{fmtBdt(l.transaction.amount)}<br /><span className="text-xs text-ink-mute">{l.transaction.paymentGateway} · {l.transaction.planPurchased}</span></td>
                      <td className="px-4 py-3"><Badge tone={TX[l.previousStatus].tone}>{TX[l.previousStatus].label}</Badge> → <Badge tone={TX[l.newStatus].tone}>{TX[l.newStatus].label}</Badge></td>
                      <td className="px-4 py-3 font-mono text-xs">{l.referenceId ?? '—'}</td>
                      <td className="max-w-[260px] px-4 py-3 text-xs text-ink-soft">{l.reconciliationNotes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {cur.data && <div className="border-t border-line px-5"><Pagination page={cur.data.page} pageSize={cur.data.pageSize} total={cur.data.total} onPage={setPage} noun="entries" /></div>}
      </Card>
    </div>
  );
}
