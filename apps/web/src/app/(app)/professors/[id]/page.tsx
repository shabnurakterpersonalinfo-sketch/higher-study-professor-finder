'use client';

import { Bookmark, Briefcase, ChevronLeft, ChevronRight, ExternalLink, Landmark, Mail, MailPlus, MessageSquareReply, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card, cx, ErrorNote, SectionTitle, Spinner } from '@/components/ui';
import { api, ApiError, useApi } from '@/lib/api';
import { fmtDate, fmtNum, REPLY } from '@/lib/format';
import type { ProfessorDetail } from '@/lib/types';

const responseTime = (h?: number | null) => (h == null ? '—' : h < 48 ? `${h} h` : `${Math.round(h / 24)} days`);

export default function ProfessorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: p, error } = useApi<ProfessorDetail>(`/professors/${id}`);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  useEffect(() => setSaved(!!p?.saved), [p]);

  if (error) return <ErrorNote error={error} />;
  if (!p) return <Spinner />;

  const track = async (sent = false) => {
    setBusy(true);
    setErr(null);
    try {
      const o = p.myOutreach ?? (await api<{ id: string }>('/outreach', { method: 'POST', json: { professorId: p.id, ...(sent && { emailSentTime: new Date().toISOString() }) } }));
      if (p.myOutreach && sent && !p.myOutreach.emailSentTime) await api(`/outreach/${o.id}/events`, { method: 'POST', json: { type: 'INITIAL_SENT' } });
      router.push(`/email-tracker?open=${o.id}`);
    } catch (e) {
      setErr(e as ApiError);
      setBusy(false);
    }
  };
  const toggleSave = async () => {
    setSaved(!saved);
    await (!saved ? api('/saved', { method: 'POST', json: { type: 'PROFESSOR', targetId: id } }) : api(`/saved/PROFESSOR/${id}`, { method: 'DELETE' }));
  };
  const matched = new Set(p.matchedAreas ?? []);
  const links = [
    ['Faculty page', p.profileLink],
    ['Google Scholar', p.googleScholarLink],
    ['Lab website', p.labWebsite],
  ].filter((l): l is [string, string] => !!l[1]);
  const s = p.outreachStats;

  const TrackBtn = (
    <Button onClick={() => track(false)} loading={busy}>
      <MailPlus className="h-4 w-4" /> {p.myOutreach ? 'Open in Tracker' : 'Add to Tracking'}
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm">
          <Link href="/universities" className="text-brand-600">Universities</Link>
          <ChevronRight className="h-4 w-4 text-ink-faint" />
          <Link href={`/universities/${p.university.id}`} className="text-brand-600">{p.university.name}</Link>
          <ChevronRight className="h-4 w-4 text-ink-faint" />
          <span>Prof. {p.name}</span>
        </nav>
        {TrackBtn}
      </div>
      <ErrorNote error={err} />

      <Card className="border-brand-300 p-8">
        <div className="flex flex-wrap gap-8">
          <Avatar name={p.name} src={p.photoUrl} size={112} />
          <div className="min-w-[260px] flex-1">
            <h1 className="text-3xl font-semibold">Prof. {p.name}</h1>
            {p.title && <p className="mt-1 text-lg text-ink-soft">{p.title}</p>}
            <p className="mt-3 flex items-center gap-2 text-ink-mute"><Landmark className="h-4 w-4" /> {p.university.name} · {p.university.location}</p>
            {p.department && <p className="mt-1 flex items-center gap-2 text-ink-mute"><Briefcase className="h-4 w-4" /> {p.department}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {p.researchAreas.map((a) => (
                <span key={a} className={cx('inline-flex items-center gap-1 rounded-full px-3 py-1 text-[13px] font-medium', matched.has(a) ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-brand-50 text-brand-700')}>
                  {matched.has(a) && <Sparkles className="h-3 w-3" />} {a}
                </span>
              ))}
            </div>
            {matched.size > 0 && <p className="mt-2 text-sm text-emerald-700">{matched.size} area{matched.size > 1 ? 's' : ''} overlap with your research interests.</p>}
          </div>
          <dl className="grid grid-cols-2 gap-x-10 gap-y-5 self-start">
            <Metric label="h-index" value={p.hIndex != null ? fmtNum(p.hIndex) : null} />
            <Metric label="Citations" value={p.citationCount != null ? fmtNum(p.citationCount) : null} />
            <Metric label="University CS rank" value={p.university.csRank?.replace(/ in Computer Science/i, '') ?? null} />
            <Metric label="Taking students" value={p.acceptingStudents ? 'Yes' : 'Not now'} />
          </dl>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-6">
            <SectionTitle>About</SectionTitle>
            {p.bio ? <p className="leading-relaxed text-ink-soft">{p.bio}</p> : <p className="text-sm text-ink-mute">No biography yet. Check the links for their latest work before you write.</p>}
          </Card>

          <Card className="p-6">
            <SectionTitle icon={<MessageSquareReply className="h-4 w-4" />}>How students' outreach has gone</SectionTitle>
            {s.insufficientData ? (
              <p className="text-sm text-ink-mute">
                {s.threads ? `${s.threads} student${s.threads > 1 ? 's have' : ' has'} emailed this professor through HigherStudy` : 'No students have tracked outreach to this professor yet'}
                {' '}— reply stats appear once at least 3 threads exist, so individual students can't be identified.
              </p>
            ) : (
              <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                <Metric label="Students emailed" value={fmtNum(s.threads)} />
                <Metric label="Reply rate" value={`${s.replyRate}%`} />
                <Metric label="Positive replies" value={`${s.positiveRate}%`} />
                <Metric label="Median reply time" value={responseTime(s.medianResponseHours)} />
              </dl>
            )}
          </Card>

          {p.openPositions?.length ? (
            <Card className="p-6">
              <SectionTitle>Open positions</SectionTitle>
              <ul className="space-y-3">
                {p.openPositions.map((o, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg bg-canvas px-4 py-3 text-sm">
                    <span>{o.count ?? 1} {o.type} position{(o.count ?? 1) > 1 ? 's' : ''}</span>
                    <span className="text-ink-mute">{o.term ?? ''}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <SectionTitle>Contact professor</SectionTitle>
            {p.email ? (
              <a className="flex items-center gap-3 text-sm text-brand-600" href={`mailto:${p.email}`}><Mail className="h-4 w-4 text-ink-faint" />{p.email}</a>
            ) : (
              <p className="text-sm text-ink-mute">No email on file.</p>
            )}
            {links.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600">{label} <ExternalLink className="h-3 w-3" /></a>
                  </li>
                ))}
              </ul>
            )}
            {p.myOutreach && (
              <div className="mt-5 border-t border-line pt-4 text-sm">
                <p className="text-ink-mute">Your email: {fmtDate(p.myOutreach.emailSentTime)}</p>
                {p.myOutreach.replyReceivedTime && <p className="text-emerald-600">Replied {fmtDate(p.myOutreach.replyReceivedTime)}</p>}
                <Badge tone={REPLY[p.myOutreach.replyStatus].tone} className="mt-2">{REPLY[p.myOutreach.replyStatus].label}</Badge>
              </div>
            )}
            {p.email && !p.myOutreach?.emailSentTime && (
              <a href={`mailto:${p.email}`} onClick={() => setTimeout(() => track(true), 300)}>
                <Button className="mt-5 w-full" size="lg"><Mail className="h-4 w-4" /> Send Email & Log It</Button>
              </a>
            )}
            <Button variant="ghost" className="mt-3 w-full" onClick={toggleSave}>
              <Bookmark className={cx('h-4 w-4', saved && 'fill-brand-600 text-brand-600')} /> {saved ? 'Saved' : 'Save Professor'}
            </Button>
          </Card>
        </div>
      </div>

      <div className="flex justify-center gap-4 pt-4">
        <Button variant="ghost" onClick={() => router.back()}><ChevronLeft className="h-4 w-4" /> Back</Button>
        {TrackBtn}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-sm text-ink-mute">{label}</dt>
      <dd className={cx('mt-1 text-xl font-semibold', !value && 'text-base font-normal text-ink-faint')}>{value ?? 'Not listed'}</dd>
    </div>
  );
}
