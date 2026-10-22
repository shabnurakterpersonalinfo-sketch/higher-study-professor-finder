'use client';

import { Building2, ChevronRight, ExternalLink, FlaskConical, GraduationCap, Heart, UserCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MatchReasons, MatchRing } from '@/components/match';
import { ProfessorBrowser } from '@/components/professor-browser';
import { Badge, Button, Card, cx, Empty, Spinner } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { FUNDING, fmtNum, uniInitials } from '@/lib/format';
import type { Program, University } from '@/lib/types';

interface Stats {
  totalProfessors: number;
  departments: number;
  researchAreas: number;
  acceptingStudents: number;
  programs: number;
}

export default function UniversityPage() {
  const { id } = useParams<{ id: string }>();
  const { data: uni } = useApi<University>(`/universities/${id}`);
  const { data: stats } = useApi<Stats>(`/universities/${id}/stats`);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<'programs' | 'professors'>('programs');

  useEffect(() => {
    api<{ universities: { id: string }[] }>('/saved?type=UNIVERSITY')
      .then((r) => setSaved(r.universities.some((u) => u.id === id)))
      .catch(() => undefined);
  }, [id]);
  useEffect(() => {
    if (stats && !stats.programs && stats.totalProfessors) setTab('professors');
  }, [stats]);

  const toggle = async () => {
    setSaved(!saved);
    await (!saved ? api('/saved', { method: 'POST', json: { type: 'UNIVERSITY', targetId: id } }) : api(`/saved/UNIVERSITY/${id}`, { method: 'DELETE' }));
  };

  if (!uni) return <Spinner />;

  return (
    <div>
      <nav className="mb-5 flex items-center gap-1.5 text-sm">
        <Link href="/universities" className="text-brand-600">Universities</Link>
        <ChevronRight className="h-4 w-4 text-ink-faint" />
        <span>{uni.name}</span>
      </nav>

      <Card className="mb-8 p-8">
        <div className="flex flex-wrap items-start gap-6">
          <div className="grid h-28 w-28 place-items-center rounded-xl border border-line text-3xl font-black text-brand-700">{uniInitials(uni.name)}</div>
          <div className="min-w-[240px] flex-1">
            <h1 className="text-3xl font-semibold">{uni.name}</h1>
            <p className="mt-1 text-lg text-ink-mute">{uni.location}, {uni.country}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {uni.csRank && <Badge tone="violet">{uni.csRank}</Badge>}
              {uni.wesRequired && <Badge tone="amber">WES evaluation required</Badge>}
            </div>
          </div>
          {uni.match && (
            <div className="min-w-[240px] rounded-xl bg-canvas p-4">
              <p className="text-sm text-ink-mute">Your match</p>
              <div className="mt-1"><MatchRing score={uni.match.score} /></div>
              <div className="mt-2"><MatchReasons reasons={uni.match.reasons} n={5} /></div>
            </div>
          )}
          <Button variant="ghost" size="lg" onClick={toggle}>
            <Heart className={cx('h-5 w-5', saved && 'fill-red-500 text-red-500')} /> {saved ? 'Saved' : 'Save University'}
          </Button>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-6 border-t border-line pt-6 md:grid-cols-5">
          {(
            [
              [<GraduationCap key="p" />, 'Programs', stats?.programs, 'bg-brand-50 text-brand-600'],
              [<Users key="a" />, 'Faculty listed', stats?.totalProfessors, 'bg-blue-50 text-blue-600'],
              [<Building2 key="b" />, 'Departments', stats?.departments, 'bg-emerald-50 text-emerald-600'],
              [<FlaskConical key="c" />, 'Research areas', stats?.researchAreas, 'bg-violet-50 text-violet-600'],
              [<UserCheck key="d" />, 'Accepting students', stats?.acceptingStudents, 'bg-orange-50 text-orange-600'],
            ] as const
          ).map(([icon, label, val, cls]) => (
            <div key={label} className="flex items-center gap-3">
              <span className={cx('grid h-11 w-11 place-items-center rounded-full [&>svg]:h-5 [&>svg]:w-5', cls)}>{icon}</span>
              <div>
                <p className="text-xl font-semibold">{fmtNum(val)}</p>
                <p className="text-sm text-ink-mute">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-6 flex gap-6 border-b border-line">
        {(['programs', 'professors'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx('-mb-px border-b-2 pb-3 capitalize', tab === t ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-ink-mute')}>
            {t} {t === 'programs' ? `(${stats?.programs ?? 0})` : `(${stats?.totalProfessors ?? 0})`}
          </button>
        ))}
      </div>

      {tab === 'programs' ? (
        uni.programs?.length ? (
          <div className="grid gap-5 xl:grid-cols-2">{uni.programs.map((p) => <ProgramCard key={p.id} p={p} />)}</div>
        ) : (
          <Empty title="No program details yet">We haven't added programs for this university. Faculty outreach still works.</Empty>
        )
      ) : (
        <ProfessorBrowser universityId={id} />
      )}
    </div>
  );
}

function ProgramCard({ p }: { p: Program }) {
  const rows: [string, string | null | undefined][] = [
    ['Deadline', p.deadlineDate ?? 'Not published yet'],
    ['Application fee', p.applicationFee],
    ['Fee waiver', [p.feeWaiverType, p.feeWaiverInfo].filter(Boolean).join(' — ') || null],
    ['GRE', p.greRequirement],
    ['English test', p.ieltsRequirement],
    ['Funding', p.financialAidPolicy],
    ['Also required', p.limitationsNotes],
  ];
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{p.programName}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="indigo">{p.degreeLevel}</Badge>
            {p.fundingLevel && <Badge tone={FUNDING[p.fundingLevel].tone}>{FUNDING[p.fundingLevel].label}</Badge>}
            {p.wesRequired && <Badge tone="amber">WES</Badge>}
          </div>
        </div>
        {p.catalogLink && (
          <a href={p.catalogLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-600">
            Catalog <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <dl className="mt-5 divide-y divide-line-soft text-sm">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[130px_1fr] gap-3 py-2.5">
            <dt className="text-ink-mute">{k}</dt>
            <dd className={k === 'Deadline' && !p.deadlineDate ? 'text-ink-faint' : 'text-ink'}>{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
