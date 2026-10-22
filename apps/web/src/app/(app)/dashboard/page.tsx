'use client';

import { ArrowRight, Bookmark, CalendarClock, FileText, GraduationCap, MailCheck, MessageSquareReply, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Donut } from '@/components/donut';
import { Avatar, Badge, Button, Card, ErrorNote, SectionTitle, Spinner } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOnboarding } from '@/lib/onboarding';
import { APP, APP_ORDER, fmtDate, PLAN_LABEL, REPLY } from '@/lib/format';
import type { AppStatus, ReplyStatus } from '@/lib/types';

interface Dashboard {
  kpis: { savedUniversities: number; savedProfessors: number; emailsSent: number; repliesReceived: number; applications: number };
  applicationOverview: { status: AppStatus; count: number }[];
  remindersDue: { id: string; nextReminderAt: string; dueInDays: number | null; professor: { name: string; photoUrl?: string | null; university: { name: string } } }[];
  recentEmails: { id: string; subject?: string | null; emailSentTime: string; replyStatus: ReplyStatus; nextReminderAt: string | null; professor: { name: string; researchAreas: string[]; university: { name: string } } }[];
  upcomingDeadlines: { id: string; deadline: string; program: { programName: string; university: { name: string } } }[];
}

const DONUT_COLORS: Record<AppStatus, string> = {
  NOT_STARTED: '#4F46E5',
  PREPARING: '#94A3B8',
  SUBMITTED: '#818CF8',
  UNDER_REVIEW: '#FBBF24',
  INTERVIEW: '#F97316',
  ACCEPTED: '#34D399',
  REJECTED: '#EF4444',
  VISA: '#06B6D4',
};

export default function DashboardPage() {
  const { me } = useAuth();
  const { state: onboarding } = useOnboarding();
  const { data, error, loading, reload } = useApi<Dashboard>('/dashboard');
  const [sending, setSending] = useState<string | null>(null);

  const logReminder = async (id: string) => {
    setSending(id);
    await api(`/outreach/${id}/events`, { method: 'POST', json: { type: 'REMINDER_SENT' } }).finally(() => setSending(null));
    reload();
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  const firstName = me?.fullName.split(' ')[0] ?? '';
  const overview = APP_ORDER.filter((s) => s !== 'VISA' && s !== 'UNDER_REVIEW').map((s) => ({
    status: s,
    count: data.applicationOverview.find((o) => o.status === s)?.count ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-mute">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight">Good to see you, {firstName}</h1>
      </div>

      {!!onboarding?.features.length && (
        <section className="rounded-card bg-night p-5 text-white sm:p-6" aria-label="New for you">
          <div className="flex items-center gap-2 text-sm text-brand-200">
            <Sparkles className="h-4 w-4" /> New for you{me && me.plan !== 'FREE' ? ` on ${PLAN_LABEL[me.plan]}` : ''}
          </div>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {onboarding.features.map((f) => (
              <li key={f.id}>
                <Link href={f.href} className="group flex h-full items-start gap-3 rounded-2xl bg-white/[0.06] p-4 transition-colors hover:bg-white/[0.1]">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {f.title}
                      {f.reason === 'UNLOCKED' && <span className="ml-2 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[11px] font-medium text-emerald-200">Unlocked</span>}
                    </p>
                    <p className="mt-1 text-sm text-brand-100">{f.body}</p>
                  </div>
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-sm font-medium text-white">
                    Show me <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5" data-tour="dashboard-kpis">
        {([
          ['Saved universities', data.kpis.savedUniversities, '/saved', <Bookmark key="a" />, 'bg-brand-50 text-brand-600'],
          ['Saved professors', data.kpis.savedProfessors, '/saved', <GraduationCap key="b" />, 'bg-violet-50 text-violet-600'],
          ['Emails sent', data.kpis.emailsSent, '/email-tracker', <MailCheck key="c" />, 'bg-sky-50 text-sky-600'],
          ['Replies received', data.kpis.repliesReceived, '/email-tracker', <MessageSquareReply key="d" />, 'bg-emerald-50 text-emerald-600'],
          ['Applications', data.kpis.applications, '/applications', <FileText key="e" />, 'bg-amber-50 text-amber-600'],
        ] as const).map(([label, value, href, icon, tone]) => (
          <Link key={label} href={href} className="rounded-card focus-visible:outline-offset-4">
            <Card className="h-full p-5 transition-shadow hover:shadow-lift">
              <span className={`grid h-9 w-9 place-items-center rounded-xl [&>svg]:h-[18px] [&>svg]:w-[18px] ${tone}`}>{icon}</span>
              <p className="mt-4 text-[28px] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
              <p className="mt-1.5 text-sm text-ink-mute">{label}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="p-6" data-tour="dashboard-reminders">
          <SectionTitle
            action={
              <Link href="/email-tracker?view=REMINDER_DUE" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                View all
              </Link>
            }
          >
            Follow-ups due
          </SectionTitle>
          {!data.remindersDue.length ? (
            <p className="py-6 text-sm text-ink-mute">No follow-ups due. Nice work.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {data.remindersDue.map((r) => (
                <li key={r.id} className="flex items-center gap-4 py-4">
                  <Avatar name={r.professor.name} src={r.professor.photoUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">Prof. {r.professor.name}</p>
                    <p className="text-sm text-ink-faint">{r.professor.university.name}</p>
                    <p className="text-sm text-ink-soft">
                      {r.dueInDays == null ? '' : r.dueInDays <= 0 ? <span className="text-red-600">Reminder overdue</span> : <>Reminder due in <span className={r.dueInDays <= 3 ? 'text-red-600' : ''}>{r.dueInDays} days</span></>}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" loading={sending === r.id} onClick={() => logReminder(r.id)}>
                    Mark follow-up sent
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <SectionTitle>Applications by stage</SectionTitle>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <ul className="min-w-[200px] flex-1 space-y-3">
              {overview.map((o) => (
                <li key={o.status} className="flex items-center gap-3 text-sm">
                  <span className="h-3 w-3 rounded-full" style={{ background: DONUT_COLORS[o.status] }} />
                  <span className="flex-1 text-ink-soft">{APP[o.status].label}</span>
                  <span className="font-semibold">{o.count}</span>
                </li>
              ))}
            </ul>
            <Donut total={data.kpis.applications} data={data.applicationOverview.map((o) => ({ label: APP[o.status].label, value: o.count, color: DONUT_COLORS[o.status] }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <div className="px-6 pt-6">
            <SectionTitle>Recent emails</SectionTitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line-soft bg-brand-25 text-left text-[13px] font-medium text-ink-mute">
                  <th className="px-6 py-3">Professor</th>
                  <th className="px-6 py-3">University</th>
                  <th className="px-6 py-3">Subject</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {data.recentEmails.map((e) => {
                  const due = e.replyStatus === 'MAILED' && e.nextReminderAt && new Date(e.nextReminderAt) <= new Date();
                  const s = due ? REPLY.REMINDER_DUE : REPLY[e.replyStatus];
                  return (
                    <tr key={e.id}>
                      <td className="px-6 py-4 font-medium">Prof. {e.professor.name}</td>
                      <td className="px-6 py-4 text-ink-soft">{e.professor.university.name}</td>
                      <td className="max-w-[220px] truncate px-6 py-4 text-ink-soft" title={e.subject ?? undefined}>{e.subject ?? e.professor.researchAreas[0] ?? '—'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-ink-soft">{fmtDate(e.emailSentTime)}</td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
                {!data.recentEmails.length && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-ink-mute">
                      No emails logged yet. <Link className="text-brand-600" href="/professors">Find a professor</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6">
          <SectionTitle icon={<CalendarClock className="h-4 w-4" />}>Upcoming deadlines</SectionTitle>
          {!data.upcomingDeadlines.length ? (
            <p className="text-sm text-ink-mute">No open deadlines on unstarted applications.</p>
          ) : (
            <ul className="space-y-3">
              {data.upcomingDeadlines.map((d) => {
                const days = Math.ceil((new Date(d.deadline).getTime() - Date.now()) / 86_400_000);
                return (
                  <li key={d.id} className="flex items-center justify-between gap-3 rounded-2xl bg-canvas/70 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{d.program.university.name}</p>
                      <p className="text-xs text-ink-mute">{d.program.programName}</p>
                    </div>
                    <Badge className="shrink-0 whitespace-nowrap" tone={days <= 7 ? 'red' : days <= 21 ? 'amber' : 'gray'}>{days}d · {fmtDate(d.deadline)}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
