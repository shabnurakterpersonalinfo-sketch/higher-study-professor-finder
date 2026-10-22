'use client';

import {
  BellRing,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Mail,
  MapPin,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  Reply,
  Search,
  Send,
  Trash2,
  User,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ProfessorPicker } from '@/components/professor-picker';
import { Avatar, Badge, Button, Card, cx, ErrorNote, Field, Input, Modal, Pagination, Select, Spinner, StatCard, Textarea } from '@/components/ui';
import { api, ApiError, qs, useApi } from '@/lib/api';
import { fmtDate, fmtTime, REPLY } from '@/lib/format';
import type { OutreachRow, Paged, ProfessorRow, ReplyStatus } from '@/lib/types';

interface Stats {
  totalProfessors: number;
  emailsSentThisMonth: number;
  repliesReceived: number;
  positiveReplies: number;
  negativeReplies: number;
  pendingReminders: number;
  interviewsThisMonth: number;
  applicationsSubmitted: number;
}

const EVENT_META: Record<string, { label: string; icon: JSX.Element; cls: string }> = {
  INITIAL_SENT: { label: 'Initial Email Sent', icon: <CheckCircle2 />, cls: 'text-emerald-600' },
  REMINDER_SENT: { label: 'Reminder Sent', icon: <CheckCircle2 />, cls: 'text-emerald-600' },
  REPLY_RECEIVED: { label: 'Reply Received', icon: <Reply />, cls: 'text-brand-600' },
  INTERVIEW_SCHEDULED: { label: 'Interview Scheduled', icon: <CalendarCheck />, cls: 'text-brand-600' },
  STATUS_CHANGED: { label: 'Status Changed', icon: <Clock />, cls: 'text-ink-faint' },
  NOTE: { label: 'Note', icon: <MessageSquare />, cls: 'text-ink-faint' },
};

function statusOf(o: OutreachRow) {
  return o.reminderDue ? REPLY.REMINDER_DUE : REPLY[o.replyStatus];
}

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(params.get('view') ?? '');
  const [range, setRange] = useState('all');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(params.get('open'));
  const [adding, setAdding] = useState(false);

  const isView = status === 'REMINDER_DUE';
  const key = '/outreach' + qs({ q: search, status: isView ? undefined : status, view: isView ? status : undefined, range, page, pageSize: 10 });
  const { data, error, loading, reload } = useApi<Paged<OutreachRow> & { stats: Stats }>(key);

  useEffect(() => {
    const t = setTimeout(() => (setSearch(q), setPage(1)), 300);
    return () => clearTimeout(t);
  }, [q]);

  const exportCsv = async () => {
    const r = await api<{ filename: string; csv: string }>('/outreach/export.csv');
    const url = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: r.filename }).click();
    URL.revokeObjectURL(url);
  };
  const close = () => {
    setOpenId(null);
    router.replace('/email-tracker');
    reload();
  };

  const s = data?.stats;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Email tracker</h1>
        <p className="mt-1 text-ink-mute">Track your emails, reminders, and responses in one place</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" />
          <Input className="pl-9" placeholder="Search professors, university…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-44" data-tour="outreach-tabs" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))}>
          <option value="">All statuses</option>
          <option value="REMINDER_DUE">Reminder due</option>
          {(Object.keys(REPLY) as (keyof typeof REPLY)[]).filter((k) => k !== 'REMINDER_DUE').map((k) => (
            <option key={k} value={k}>{REPLY[k].label}</option>
          ))}
        </Select>
        <Select className="w-36" value={range} onChange={(e) => (setRange(e.target.value), setPage(1))}>
          <option value="all">All time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setAdding(true)} data-tour="outreach-add">
            <Plus className="h-4 w-4" /> Track a professor
          </Button>
          <Button variant="ghost" onClick={exportCsv} data-tour="outreach-export">
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
          <StatCard icon={<User className="h-5 w-5" />} label="Professors" value={s.totalProfessors} sub="All tracked professors" />
          <StatCard icon={<Mail className="h-5 w-5" />} tone="blue" label="Emails sent" value={s.emailsSentThisMonth} sub="This month" />
          <StatCard icon={<MessageSquare className="h-5 w-5" />} tone="green" label="Replies" value={s.repliesReceived} sub={`Positive: ${s.positiveReplies} · Negative: ${s.negativeReplies}`} />
          <StatCard icon={<Clock className="h-5 w-5" />} tone="orange" label="Follow-ups due" value={s.pendingReminders} sub="Due in next 7 days" />
          <StatCard icon={<CalendarCheck className="h-5 w-5" />} tone="amber" label="Interviews" value={s.interviewsThisMonth} sub="This month" />
          <StatCard icon={<FileText className="h-5 w-5" />} tone="violet" label="Applications" value={s.applicationsSubmitted} sub="Submitted" />
        </div>
      )}

      <Card className="overflow-hidden" data-tour="outreach-list">
        <ErrorNote error={error} />
        {loading && !data ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-brand-25 text-left text-[13px] font-medium text-ink-mute">
                <tr>
                  <th className="px-6 py-4">Professor</th>
                  <th className="px-4 py-4">University</th>
                  <th className="px-4 py-4">Email</th>
                  <th className="px-4 py-4">Mail sent</th>
                  <th className="px-4 py-4">Reminder</th>
                  <th className="px-4 py-4">Reply received</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Notes</th>
                  <th className="px-4 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {data?.items.map((o) => {
                  const st = statusOf(o);
                  const remind = o.reminderSentTime ?? o.nextReminderAt;
                  return (
                    <tr key={o.id} className="cursor-pointer hover:bg-brand-50/40" onClick={() => setOpenId(o.id)}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={o.professor.name} src={o.professor.photoUrl} size={38} />
                          <div>
                            <p className="font-semibold">{o.professor.name}</p>
                            <p className="text-ink-mute">{o.professor.title?.split(' of ')[0] ?? ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">{o.professor.university.name}</td>
                      <td className="max-w-[200px] truncate px-4 py-4 text-ink-soft">{o.professor.email ?? '—'}</td>
                      <td className="whitespace-nowrap px-4 py-4">{o.emailSentTime ? <>{fmtDate(o.emailSentTime)}<br /><span className="text-ink-mute">{fmtTime(o.emailSentTime)}</span></> : '—'}</td>
                      <td className={cx('whitespace-nowrap px-4 py-4', o.reminderDue && 'text-red-600')}>
                        {remind ? <>{fmtDate(remind)}<br /><span className={o.reminderDue ? 'text-xs' : 'text-ink-mute'}>{o.reminderDue ? 'Reminder due' : o.reminderSentTime ? 'Sent' : 'Scheduled'}</span></> : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">{o.replyReceivedTime ? <>{fmtDate(o.replyReceivedTime)}<br /><span className="text-ink-mute">{fmtTime(o.replyReceivedTime)}</span></> : '-'}</td>
                      <td className="whitespace-nowrap px-4 py-4"><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td className="px-4 py-4"><MessageSquare className={cx('h-4 w-4', o.professorReplyNotes ? 'text-brand-600' : 'text-ink-faint')} /></td>
                      <td className="px-4 py-4"><MoreVertical className="h-4 w-4 text-ink-faint" /></td>
                    </tr>
                  );
                })}
                {!data?.items.length && (
                  <tr>
                    <td colSpan={9} className="px-6 py-14 text-center text-ink-mute">No outreach yet. Add a professor to start a thread.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {data && <div className="border-t border-line px-5"><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></div>}
      </Card>

      {openId && <DetailModal id={openId} onClose={close} />}
      <AddModal open={adding} onClose={() => setAdding(false)} onDone={(id) => (setAdding(false), reload(), setOpenId(id))} />
    </div>
  );
}

function AddModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const [prof, setProf] = useState<ProfessorRow | null>(null);
  const [subject, setSubject] = useState('');
  const [sentAt, setSentAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const submit = async () => {
    if (!prof) return;
    setBusy(true);
    setErr(null);
    try {
      const o = await api<{ id: string }>('/outreach', { method: 'POST', json: { professorId: prof.id, subject: subject || undefined, emailSentTime: sentAt ? new Date(sentAt).toISOString() : undefined } });
      setProf(null), setSubject(''), setSentAt('');
      onDone(o.id);
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Track a professor" subtitle="Start an outreach thread. log the first email now or later." icon={<Plus />}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!prof}>Add to Tracker</Button></>}>
      <div className="space-y-4">
        <ErrorNote error={err?.status === 409 ? { message: 'You are already tracking this professor.' } : err} />
        <Field label="Professor" required><ProfessorPicker value={prof} onChange={setProf} /></Field>
        <Field label="Subject" optional><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Prospective PhD student — research fit" /></Field>
        <Field label="First email sent at" optional hint="Leave empty if you haven't emailed yet. A follow-up reminder is scheduled 7 days after."><Input type="datetime-local" value={sentAt} onChange={(e) => setSentAt(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function DetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: o, reload, error } = useApi<OutreachRow>(`/outreach/${id}`);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setNotes(o?.professorReplyNotes ?? ''), [o]);

  const event = async (type: string, note?: string) => {
    setBusy(type);
    await api(`/outreach/${id}/events`, { method: 'POST', json: { type, note } }).finally(() => setBusy(null));
    reload();
  };
  const patch = async (body: Record<string, unknown>) => {
    await api(`/outreach/${id}`, { method: 'PATCH', json: body });
    reload();
  };
  const remove = async () => {
    if (!confirm('Delete this outreach thread and its timeline?')) return;
    await api(`/outreach/${id}`, { method: 'DELETE' });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Detailed view" wide>
      {error ? <ErrorNote error={error} /> : !o ? <Spinner /> : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex flex-wrap items-center gap-5">
                <Avatar name={o.professor.name} src={o.professor.photoUrl} size={96} />
                <div className="flex-1">
                  <h3 className="text-2xl font-semibold">{o.professor.name}</h3>
                  <p className="text-ink-soft">{o.professor.title}</p>
                  <Badge tone={statusOf(o).tone} className="mt-2">{statusOf(o).label}</Badge>
                </div>
                <Select className="w-48" value={o.replyStatus} onChange={(e) => patch({ replyStatus: e.target.value as ReplyStatus })}>
                  {(Object.keys(REPLY) as (keyof typeof REPLY)[]).filter((k) => k !== 'REMINDER_DUE').map((k) => <option key={k} value={k}>{REPLY[k].label}</option>)}
                </Select>
              </div>
              <div className="mt-5 grid gap-3 border-t border-line pt-5 text-sm sm:grid-cols-2">
                <p className="flex items-center gap-2 text-ink-soft"><MapPin className="h-4 w-4" /> {o.professor.university.name}{o.professor.university.location ? `, ${o.professor.university.location}` : ''}</p>
                {o.professor.email && <a className="flex items-center gap-2 text-brand-600" href={`mailto:${o.professor.email}`}><Mail className="h-4 w-4" />{o.professor.email}</a>}
              </div>
            </Card>

            <Card className="p-6">
              <h4 className="mb-5 text-lg font-semibold">Email timeline</h4>
              {!o.events?.length ? <p className="text-sm text-ink-mute">No activity yet.</p> : (
                <ol className="relative space-y-6 border-l border-line pl-6">
                  {o.events.map((ev) => {
                    const m = EVENT_META[ev.type] ?? EVENT_META.NOTE;
                    return (
                      <li key={ev.id} className="relative">
                        <span className={cx('absolute -left-[37px] grid h-6 w-6 place-items-center rounded-full bg-white [&>svg]:h-6 [&>svg]:w-6', m.cls)}>{m.icon}</span>
                        <p className="font-medium">{m.label}</p>
                        <p className="text-sm text-ink-mute">{fmtDate(ev.occurredAt)} at {fmtTime(ev.occurredAt)}</p>
                        {ev.note && <p className="mt-1 text-sm text-ink-soft">{ev.note}</p>}
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
                {!o.emailSentTime && <Button size="sm" onClick={() => event('INITIAL_SENT')} loading={busy === 'INITIAL_SENT'}><Send className="h-3.5 w-3.5" /> Log first email</Button>}
                {o.emailSentTime && <Button size="sm" variant="secondary" onClick={() => event('REMINDER_SENT')} loading={busy === 'REMINDER_SENT'}><BellRing className="h-3.5 w-3.5" /> Log reminder sent</Button>}
                <Button size="sm" variant="secondary" onClick={() => event('REPLY_RECEIVED')} loading={busy === 'REPLY_RECEIVED'}><Reply className="h-3.5 w-3.5" /> Log reply</Button>
                <Button size="sm" variant="secondary" onClick={() => event('INTERVIEW_SCHEDULED')} loading={busy === 'INTERVIEW_SCHEDULED'}><CalendarCheck className="h-3.5 w-3.5" /> Interview scheduled</Button>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <h4 className="mb-3 text-lg font-semibold">Funding & interview</h4>
              <div className="space-y-3">
                <Field label="Funding status">
                  <Select value={o.fundingStatus ?? ''} onChange={(e) => patch({ fundingStatus: e.target.value || undefined })}>
                    <option value="">Unknown</option>
                    {['Pending', 'Funding Available', 'No Open Slots', 'Self-funded only'].concat(o.fundingStatus && !['Pending', 'Funding Available', 'No Open Slots', 'Self-funded only'].includes(o.fundingStatus) ? [o.fundingStatus] : []).map((v) => <option key={v}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Interview">
                  <Select value={o.interviewStatus ?? ''} onChange={(e) => patch({ interviewStatus: e.target.value || undefined })}>
                    <option value="">None</option>
                    {['Requested', 'Scheduled', 'Completed'].concat(o.interviewStatus && !['Requested', 'Scheduled', 'Completed'].includes(o.interviewStatus) ? [o.interviewStatus] : []).map((v) => <option key={v}>{v}</option>)}
                  </Select>
                </Field>
              </div>
            </Card>
            <Card className="p-6">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-lg font-semibold">Notes</h4>
                <button onClick={() => (editing ? (patch({ professorReplyNotes: notes }), setEditing(false)) : setEditing(true))} className="text-ink-faint hover:text-brand-600" aria-label="Edit notes">
                  {editing ? <CheckCircle2 className="h-5 w-5 text-brand-600" /> : <Pencil className="h-4 w-4" />}
                </button>
              </div>
              {editing ? <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus /> : <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{o.professorReplyNotes || 'No notes yet.'}</p>}
            </Card>
            <Card className="p-6">
              <h4 className="mb-3 text-lg font-semibold">Attachments</h4>
              {[o.attachedCvUrl, o.attachedProposalUrl].filter(Boolean).length ? (
                <ul className="space-y-3">
                  {[o.attachedCvUrl, o.attachedProposalUrl].filter(Boolean).map((a) => (
                    <li key={a!} className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm">
                      <FileText className="h-5 w-5 text-red-600" />
                      <span className="flex-1 truncate font-medium">{a!.split('/').pop()}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-ink-mute">No files linked.</p>}
            </Card>
            <div className="text-sm">
              <p className="font-semibold">Last updated</p>
              <p className="text-ink-mute">{fmtDate(o.updatedAt)} at {fmtTime(o.updatedAt)}</p>
            </div>
            <Button variant="ghost" className="w-full text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete thread</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function EmailTrackerPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Inner />
    </Suspense>
  );
}
