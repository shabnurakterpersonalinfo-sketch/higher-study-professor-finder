'use client';

import { ChevronDown, ChevronUp, GraduationCap, Heart, MapPin, Users } from 'lucide-react';
import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import { MatchReasons, MatchRing } from '@/components/match';
import { Badge, Button, Card, cx, Empty, ErrorNote, Field, Input, Pagination, Select, Spinner } from '@/components/ui';
import { api, qs, useApi } from '@/lib/api';
import { FUNDING, shortRank, uniInitials } from '@/lib/format';
import type { Paged, University } from '@/lib/types';

interface Facets {
  states: { key: string; count: number }[];
  degreeLevels: { key: string; count: number }[];
  fundingLevels: { key: string; count: number }[];
  researchAreas: { key: string; count: number }[];
  wesRequired: number;
}

function Panel({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="p-5">
      <button className="flex w-full items-center justify-between text-left font-medium" onClick={() => setOpen(!open)}>
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-ink-faint" /> : <ChevronDown className="h-4 w-4 text-ink-faint" />}
      </button>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </Card>
  );
}

const empty = { q: '', degreeLevel: '', funding: '', states: [] as string[], maxRank: '', maxFee: '', researchArea: '', noWes: false, feeWaiver: false, hasFaculty: false };

export default function UniversitiesPage() {
  const [draft, setDraft] = useState(empty);
  const [applied, setApplied] = useState(empty);
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(true);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const facets = useApi<Facets>('/universities/facets').data;

  const key =
    '/universities' +
    qs({
      q: applied.q,
      degreeLevel: applied.degreeLevel,
      funding: applied.funding,
      states: applied.states,
      maxRank: applied.maxRank,
      maxFee: applied.maxFee,
      researchArea: applied.researchArea,
      wes: applied.noWes ? 'false' : undefined,
      feeWaiver: applied.feeWaiver || undefined,
      hasFaculty: applied.hasFaculty || undefined,
      sort,
      page,
      pageSize: 8,
    });
  const { data, error, loading } = useApi<Paged<University> & { sort: string }>(key);
  useEffect(() => {
    if (data) setSaved(Object.fromEntries(data.items.map((u) => [u.id, !!u.saved])));
  }, [data]);

  const activeCount = Object.values(applied).filter((v) => (Array.isArray(v) ? v.length : !!v)).length;
  const toggleSave = async (id: string) => {
    const on = !saved[id];
    setSaved((s) => ({ ...s, [id]: on }));
    await (on ? api('/saved', { method: 'POST', json: { type: 'UNIVERSITY', targetId: id } }) : api(`/saved/UNIVERSITY/${id}`, { method: 'DELETE' }));
  };
  const toggleState = (s: string) => setDraft((d) => ({ ...d, states: d.states.includes(s) ? d.states.filter((x) => x !== s) : [...d.states, s] }));
  const effectiveSort = sort || data?.sort || 'match';

  return (
    <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Find universities</h1>
        <p className="mt-2 text-ink-mute">Ranked by how well each one fits your profile — research overlap, funding and requirements.</p>
        <div className="mb-3 mt-8 flex items-center justify-between">
          <p className="font-semibold">Filters</p>
          <button className="flex items-center gap-1 text-sm text-ink-mute" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? 'Hide' : 'Show'} {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
        {showFilters && (
          <div className="space-y-4" data-tour="uni-filters">
            <Panel title="Program">
              <Field label="Degree level">
                <Select value={draft.degreeLevel} onChange={(e) => setDraft({ ...draft, degreeLevel: e.target.value })}>
                  <option value="">Any</option>
                  {(facets?.degreeLevels ?? []).map((d) => (
                    <option key={d.key} value={d.key}>{d.key} ({d.count})</option>
                  ))}
                </Select>
              </Field>
              <Field label="Funding">
                <Select value={draft.funding} onChange={(e) => setDraft({ ...draft, funding: e.target.value })}>
                  <option value="">Any</option>
                  <option value="GUARANTEED">Guaranteed for admitted students</option>
                  <option value="AVAILABLE">Assistantships available (or better)</option>
                </Select>
              </Field>
              <Field label="Max application fee (USD)" optional>
                <Input type="number" min={0} value={draft.maxFee} onChange={(e) => setDraft({ ...draft, maxFee: e.target.value })} placeholder="e.g. 60" />
              </Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.feeWaiver} onChange={(e) => setDraft({ ...draft, feeWaiver: e.target.checked })} /> Free or fee waiver available</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.noWes} onChange={(e) => setDraft({ ...draft, noWes: e.target.checked })} /> No WES evaluation needed</label>
            </Panel>
            <Panel title="Ranking & research">
              <Field label={`US News CS rank${draft.maxRank ? `: top ${draft.maxRank}` : ': any'}`}>
                <input type="range" min={5} max={200} step={5} value={draft.maxRank || 200} onChange={(e) => setDraft({ ...draft, maxRank: e.target.value === '200' ? '' : e.target.value })} className="w-full" />
              </Field>
              <Field label="Faculty research area">
                <Select value={draft.researchArea} onChange={(e) => setDraft({ ...draft, researchArea: e.target.value })}>
                  <option value="">Any</option>
                  {(facets?.researchAreas ?? []).map((a) => (
                    <option key={a.key} value={a.key}>{a.key} ({a.count})</option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.hasFaculty} onChange={(e) => setDraft({ ...draft, hasFaculty: e.target.checked })} /> Has listed faculty</label>
            </Panel>
            <Panel title="Location" defaultOpen={false}>
              <div className="flex flex-wrap gap-2">
                {(facets?.states ?? []).map((s) => (
                  <button
                    key={s.key}
                    onClick={() => toggleState(s.key)}
                    className={cx('rounded-full px-3 py-1 text-[13px] ring-1', draft.states.includes(s.key) ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-white text-ink-soft ring-line hover:ring-slate-300')}
                  >
                    {s.key} <span className="text-ink-faint">{s.count}</span>
                  </button>
                ))}
              </div>
            </Panel>
            <Field label="Name or city">
              <Input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="e.g. Philadelphia" onKeyDown={(e) => e.key === 'Enter' && (setApplied(draft), setPage(1))} />
            </Field>
            <Button className="w-full" size="lg" onClick={() => (setApplied(draft), setPage(1))}>
              Apply filters
            </Button>
          </div>
        )}
      </div>

      <div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button className="text-sm font-medium text-brand-600" onClick={() => (setDraft(empty), setApplied(empty), setPage(1))}>
              Clear all {activeCount ? `(${activeCount})` : ''}
            </button>
            {data && <span className="text-sm text-ink-mute">{data.total} {data.total === 1 ? 'university' : 'universities'}</span>}
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-white pl-3 text-sm text-ink-mute shadow-card" data-tour="uni-sort">
            Sort by
            <Select value={effectiveSort} onChange={(e) => (setSort(e.target.value), setPage(1))} className="w-44 border-0 bg-transparent font-medium text-ink">
              <option value="match">Best match</option>
              <option value="rank">CS ranking</option>
              <option value="fee">Lowest fee</option>
              <option value="name">Name</option>
            </Select>
          </label>
        </div>
        <ErrorNote error={error} />
        {loading && !data ? (
          <Spinner />
        ) : !data?.items.length ? (
          <Empty title="No universities match these filters">Try widening the rank range or removing the funding filter.</Empty>
        ) : (
          <div className="space-y-5">
            {data.items.map((u, i) => {
              const best = i === 0 && effectiveSort === 'match' && page === 1 && (u.match?.score ?? 0) > 0;
              const programs = u.programs ?? [];
              const fees = programs.map((p) => p.applicationFeeUsd).filter((n): n is number => n != null);
              const funding = (['GUARANTEED', 'AVAILABLE', 'CONDITIONAL'] as const).find((l) => programs.some((p) => p.fundingLevel === l));
              const ielts = programs.map((p) => p.ieltsMinOverall).filter((n): n is number => n != null);
              const wes = u.wesRequired || programs.some((p) => p.wesRequired);
              return (
                <Card key={u.id} className={cx('relative p-6 transition-shadow hover:shadow-lift', best && 'border-brand-200')} data-tour={i === 0 ? 'uni-card' : undefined}>
                  {best && <span className="absolute -top-3 left-8 rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">Best match</span>}
                  <div className="flex gap-5">
                    <div className="hidden h-24 w-24 shrink-0 place-items-center rounded-2xl bg-brand-25 text-lg font-semibold text-brand-700 ring-1 ring-inset ring-brand-100 sm:grid">{uniInitials(u.name)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-semibold">{u.name}</h3>
                          <p className="mt-1 flex items-center gap-1 text-ink-mute"><MapPin className="h-4 w-4" /> {u.location}, {u.country}</p>
                          {u.csRank && <Badge tone="violet" className="mt-2">{u.csRank}</Badge>}
                        </div>
                        <button onClick={() => toggleSave(u.id)} aria-label="Save university" className="p-1">
                          <Heart className={cx('h-6 w-6', saved[u.id] ? 'fill-red-500 text-red-500' : 'text-ink-faint')} />
                        </button>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_1fr_1.4fr]">
                        <Stat label="CS rank" value={u.csRankPosition ? `#${u.csRankPosition}${u.csRankTied ? ' (tie)' : ''}` : '—'} />
                        <Stat label="Programs" value={<span className="flex items-center gap-1"><GraduationCap className="h-4 w-4 text-ink-faint" />{u._count?.programs ?? programs.length}</span>} />
                        <Stat label="Faculty listed" value={<span className="flex items-center gap-1"><Users className="h-4 w-4 text-ink-faint" />{u._count?.professors ?? 0}</span>} />
                        <div>
                          <p className="text-sm text-ink-mute">Match score</p>
                          {u.match ? (
                            <div className="mt-1 space-y-2"><MatchRing score={u.match.score} /><MatchReasons reasons={u.match.reasons} n={2} /></div>
                          ) : (
                            <p className="mt-1 text-sm text-ink-mute">Complete your profile</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          {programs.some((p) => p.greRequired) && <Badge tone="red">GRE Required</Badge>}
                          {ielts.length > 0 && <Badge tone="blue">IELTS {Math.min(...ielts)}+</Badge>}
                          {funding && <Badge tone={FUNDING[funding].tone}>{FUNDING[funding].label}</Badge>}
                          {fees.length > 0 && <Badge tone={Math.min(...fees) === 0 ? 'green' : 'gray'}>{Math.min(...fees) === 0 ? 'No application fee' : `Fee from $${Math.min(...fees)}`}</Badge>}
                          {wes && <Badge tone="amber">WES required</Badge>}
                          {!programs.length && <Badge tone="gray">Program details coming soon</Badge>}
                        </div>
                        <Link href={`/universities/${u.id}`}>
                          <Button variant="secondary">{u._count?.professors ? 'View professors' : 'View details'}</Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} noun="universities" />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-sm text-ink-mute">{label}</p>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
