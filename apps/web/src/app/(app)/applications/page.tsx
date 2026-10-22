'use client';

import { CalendarDays, CheckCircle2, Clock, Download, FileText, Filter, Hourglass, IdCard, Plus, Search, Send, XCircle } from 'lucide-react';
import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import { ApplicationFormModal } from '@/components/application-form';
import { Badge, Button, Card, cx, ErrorNote, Input, Select, Spinner } from '@/components/ui';
import { api, ApiError, qs, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { APP, APP_ORDER, fmtDate, PLAN_LABEL } from '@/lib/format';
import type { Application, AppStatus } from '@/lib/types';

interface Board {
  columns: { status: AppStatus; items: Application[] }[];
  counts: { status: AppStatus; count: number; percent: number }[];
  total: number;
}

const ICON: Record<AppStatus, ReactNode> = {
  NOT_STARTED: <Hourglass />,
  PREPARING: <FileText />,
  SUBMITTED: <Send />,
  INTERVIEW: <CalendarDays />,
  UNDER_REVIEW: <Clock />,
  ACCEPTED: <CheckCircle2 />,
  REJECTED: <XCircle />,
  VISA: <IdCard />,
};
const ICON_BG: Record<AppStatus, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-500',
  PREPARING: 'bg-blue-50 text-blue-600',
  SUBMITTED: 'bg-violet-50 text-violet-600',
  INTERVIEW: 'bg-orange-50 text-orange-500',
  UNDER_REVIEW: 'bg-amber-50 text-amber-500',
  ACCEPTED: 'bg-emerald-50 text-emerald-600',
  REJECTED: 'bg-red-50 text-red-500',
  VISA: 'bg-cyan-50 text-cyan-600',
};
const PLAN_CAP: Record<string, number | null> = { FREE: 3, STARTER: 20, PRO: null, PREMIUM: null };

export default function ApplicationsPage() {
  const { me } = useAuth();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const { data, error, loading, reload, setData } = useApi<Board>('/applications' + qs({ q: search, status: statusFilter }));
  const [form, setForm] = useState<{ open: boolean; existing?: Application | null; status?: AppStatus }>({ open: false });
  const [dragId, setDragId] = useState<string | null>(null);
  const [moveErr, setMoveErr] = useState<ApiError | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  /** Optimistic drag-and-drop between kanban columns. */
  const move = async (id: string, to: AppStatus) => {
    if (!data) return;
    const app = data.columns.flatMap((c) => c.items).find((a) => a.id === id);
    if (!app || app.status === to) return;
    const prev = data;
    setData({ ...data, columns: data.columns.map((c) => ({ ...c, items: c.status === to ? [{ ...app, status: to }, ...c.items] : c.items.filter((a) => a.id !== id) })) });
    try {
      await api(`/applications/${id}`, { method: 'PATCH', json: { status: to } });
      reload();
    } catch (e) {
      setData(prev);
      setMoveErr(e as ApiError);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = data.columns.flatMap((c) => c.items);
    const csv = ['University,Program,Country,Status,Intake,Deadline,Submitted', ...rows.map((a) => [a.program.university.name, a.program.programName, a.program.university.country, APP[a.status].label, a.intakeTerm ?? '', fmtDate(a.deadline), fmtDate(a.appliedAt)].map((v) => `"${v}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'applications.csv' }).click();
  };

  const cap = me ? PLAN_CAP[me.plan] : null;
  const atCap = cap != null && (data?.total ?? 0) >= cap;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Applications</h1>
          <p className="mt-1.5 text-[15px] text-ink-mute">Every program you’re applying to, from first draft to decision.</p>
          {data && me && (
            <div className="mt-3 flex items-center gap-3 text-sm text-ink-mute" data-tour="apps-usage">
              {cap != null ? (
                <>
                  <span className="h-1.5 w-28 overflow-hidden rounded-full bg-white ring-1 ring-line-soft">
                    <span className={cx('block h-full rounded-full', atCap ? 'bg-amber-500' : 'bg-brand-500')} style={{ width: `${Math.min(100, (data.total / cap) * 100)}%` }} />
                  </span>
                  {data.total} of {cap} on {PLAN_LABEL[me.plan]}
                </>
              ) : (
                <>{data.total} tracked · no limit on {PLAN_LABEL[me.plan]}</>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" />
            <Input className="pl-9" placeholder="Search applications…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button variant="ghost" onClick={() => setShowFilter(!showFilter)}><Filter className="h-4 w-4" /> Filter</Button>
          <Button variant="ghost" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
          <Button onClick={() => setForm({ open: true })} disabled={atCap} title={atCap ? 'Plan limit reached' : undefined} data-tour="apps-add">
            <Plus className="h-4 w-4" /> Add application
          </Button>
        </div>
      </div>

      {showFilter && (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <span className="text-sm text-ink-mute">Status</span>
          <Select className="w-48" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {APP_ORDER.map((s) => <option key={s} value={s}>{APP[s].label}</option>)}
          </Select>
        </Card>
      )}

      {atCap && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-5 py-3 text-sm text-amber-800">
          Your {me?.plan.toLowerCase()} plan tracks up to {cap} applications.
          <Link href="/purchase-plan"><Button size="sm">Upgrade plan</Button></Link>
        </div>
      )}
      <ErrorNote error={error ?? moveErr} />

      {loading && !data ? <Spinner /> : data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-8">
            {data.counts.map((c) => (
              <button key={c.status} onClick={() => setStatusFilter(statusFilter === c.status ? '' : c.status)}>
                <Card className={cx('flex items-center justify-between p-4 text-left transition', statusFilter === c.status && 'border-brand-300 ring-4 ring-brand-100')}>
                  <div>
                    <p className="text-sm text-ink-mute">{APP[c.status].label}</p>
                    <p className="mt-1 text-2xl font-semibold">{c.count}</p>
                    <p className="text-xs text-ink-faint">{c.percent}%</p>
                  </div>
                  <span className={cx('grid h-10 w-10 place-items-center rounded-full [&>svg]:h-5 [&>svg]:w-5', ICON_BG[c.status])}>{ICON[c.status]}</span>
                </Card>
              </button>
            ))}
          </div>

          <div className="scroll-thin -mx-4 flex gap-5 overflow-x-auto px-4 pb-4" data-tour="apps-board">
            {data.columns.map((col) => (
              <div
                key={col.status}
                className={cx('w-[300px] shrink-0 rounded-3xl bg-white/50 p-2.5 transition-colors', dragId && 'bg-brand-50/60')}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragId && (move(dragId, col.status), setDragId(null))}
              >
                <p className="mb-3 flex items-center gap-2 px-1.5 pt-1 text-[15px] font-medium">
                  <span className={cx('h-2.5 w-2.5 rounded-full', APP[col.status].dot)} />
                  {APP[col.status].label} <span className="font-normal text-ink-faint">({col.items.length})</span>
                </p>
                <div className="space-y-4">
                  {col.items.map((a) => (
                    <Card key={a.id} draggable onDragStart={() => setDragId(a.id)} onDragEnd={() => setDragId(null)} className="cursor-grab p-5 transition-shadow hover:shadow-lift active:cursor-grabbing">
                      <p className="font-medium">{a.program.university.name}</p>
                      <p className="text-sm text-ink-mute">{a.program.programName}</p>
                      <dl className="mt-4 space-y-1.5 text-sm">
                        {(a.status === 'INTERVIEW' && a.interviewAt ? [['Interview', fmtDate(a.interviewAt)]] : a.appliedAt && a.status !== 'NOT_STARTED' && a.status !== 'PREPARING' ? [['Submitted', fmtDate(a.appliedAt)]] : [])
                          .concat([['Intake', a.intakeTerm ?? '—']], a.status === 'NOT_STARTED' || a.status === 'PREPARING' ? [['Deadline', a.deadline ? fmtDate(a.deadline) : a.program.deadlineDate ?? 'Not published']] : [], [['Location', a.program.university.location ?? a.program.university.country]], a.trackingReferenceId ? [['Reference', a.trackingReferenceId]] : [])
                          .map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2">
                              <dt className="text-ink-mute">{k}:</dt>
                              <dd>{v}</dd>
                            </div>
                          ))}
                      </dl>
                      {a.documentsTotal != null && (
                        <div className="mt-3">
                          <div className="h-1.5 rounded-full bg-canvas">
                            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${((a.documentsComplete ?? 0) / a.documentsTotal) * 100}%` }} />
                          </div>
                          <p className="mt-1 text-[11px] text-ink-faint" title={a.checklist?.filter((c) => c.required && !c.done).map((c) => c.label).join(', ')}>
                            {a.documentsComplete}/{a.documentsTotal} required documents
                            {a.checklist?.some((c) => c.required && !c.done) && <> · missing {a.checklist.filter((c) => c.required && !c.done).map((c) => c.label).join(', ')}</>}
                          </p>
                          {(a.program.wesRequired || a.program.university.wesRequired) && <Badge tone="amber" className="mt-2">WES evaluation</Badge>}
                        </div>
                      )}
                      <div className="mt-4 flex items-center justify-between">
                        <Badge tone={APP[a.status].tone}>{APP[a.status].label}</Badge>
                        <Button size="sm" variant="secondary" onClick={() => setForm({ open: true, existing: a })}>Open</Button>
                      </div>
                    </Card>
                  ))}
                  <button
                    onClick={() => setForm({ open: true, status: col.status })}
                    disabled={atCap}
                    className="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-line py-4 text-sm text-ink-mute hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" /> Add application
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ApplicationFormModal
        open={form.open}
        existing={form.existing}
        defaultStatus={form.status}
        onClose={() => setForm({ open: false })}
        onSaved={() => (setForm({ open: false }), reload())}
      />
    </div>
  );
}
