'use client';

import { Bookmark, LayoutGrid, List, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Avatar, Badge, Button, Card, cx, Empty, ErrorNote, Field, Input, Pagination, Segmented, Select, Spinner, Tag } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtNum } from '@/lib/format';
import type { OpenPosition, Paged, ProfessorRow } from '@/lib/types';

interface Facets {
  academicRanks: { key: string; count: number }[];
  openings: { key: string; count: number }[];
  researchAreas: { key: string; count: number }[];
  departments: { key: string; count: number }[];
  withHIndex: number;
  withCitations: number;
}

const openingsText = (o?: OpenPosition[] | null) => (o?.length ? o.map((p) => `${p.count ?? 1} ${p.type}`).join(', ') : null);

type Filters = { q: string; department: string; researchArea: string; academicRanks: string[]; openings: string[]; minHIndex: number; minCitations: number; acceptingStudents: boolean };
const EMPTY: Filters = { q: '', department: '', researchArea: '', academicRanks: [], openings: [], minHIndex: 0, minCitations: 0, acceptingStudents: false };

export function ProfessorBrowser({ universityId, initialQuery = '' }: { universityId?: string; initialQuery?: string }) {
  const [tab, setTab] = useState<'all' | 'accepting' | 'openings'>('all');
  const [draft, setDraft] = useState<Filters>({ ...EMPTY, q: initialQuery });
  const [applied, setApplied] = useState<Filters>({ ...EMPTY, q: initialQuery });
  const [sort, setSort] = useState(''); // '' = server default: fit for students with interests
  const [page, setPage] = useState(1);
  const [grid, setGrid] = useState(false);
  const [data, setData] = useState<(Paged<ProfessorRow> & { sort?: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const facets = useApi<Facets>(universityId ? `/professors/facets/${universityId}` : '/professors/facets').data;

  useEffect(() => {
    setDraft((d) => ({ ...d, q: initialQuery }));
    setApplied((a) => ({ ...a, q: initialQuery }));
  }, [initialQuery]);

  const body = useMemo(
    () => ({
      q: applied.q || undefined,
      universityId,
      department: applied.department || undefined,
      researchAreas: applied.researchArea ? [applied.researchArea] : undefined,
      academicRanks: applied.academicRanks.length ? applied.academicRanks : undefined,
      openings: tab === 'openings' ? ['PhD', 'Postdoc', 'RA'] : applied.openings.length ? applied.openings : undefined,
      acceptingStudents: tab === 'accepting' || applied.acceptingStudents ? true : undefined,
      minHIndex: applied.minHIndex || undefined,
      minCitations: applied.minCitations || undefined,
      sort: sort || undefined,
      page,
      pageSize: 10,
    }),
    [applied, universityId, tab, sort, page],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<Paged<ProfessorRow> & { sort?: string }>('/professors/search', { method: 'POST', json: body })
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [body]);

  useEffect(() => {
    api<{ professors: { id: string }[] }>('/saved?type=PROFESSOR')
      .then((r) => setSaved(new Set(r.professors.map((p) => p.id))))
      .catch(() => undefined);
  }, []);

  const toggleSave = async (id: string) => {
    const on = !saved.has(id);
    setSaved((s) => {
      const n = new Set(s);
      on ? n.add(id) : n.delete(id);
      return n;
    });
    await (on ? api('/saved', { method: 'POST', json: { type: 'PROFESSOR', targetId: id } }) : api(`/saved/PROFESSOR/${id}`, { method: 'DELETE' }));
  };
  const toggleIn = (k: 'academicRanks' | 'openings', v: string) => setDraft((d) => ({ ...d, [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v] }));
  const apply = () => (setApplied(draft), setPage(1));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <Segmented
          className="mb-5"
          value={tab}
          onChange={(k) => (setTab(k), setPage(1))}
          options={(
            [
              ['all', 'All professors', tab === 'all' && data ? data.total : undefined],
              ['accepting', 'Accepting students', undefined],
              ['openings', 'With open positions', undefined],
            ] as const
          )
            .filter(([k]) => k !== 'openings' || !!facets?.openings.length)
            .map(([k, label, count]) => ({ value: k, label, count }))}
        />

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <form
            className="relative min-w-[220px] flex-1"
            data-tour="prof-search"
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input className="pl-9" placeholder="Search professors…" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
          </form>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-ink-mute">
            Sort by
            <Select value={sort || data?.sort || 'fit'} onChange={(e) => (setSort(e.target.value), setPage(1))} className="w-48">
              <option value="fit">Best fit for me</option>
              <option value="relevance">Search relevance</option>
              {!!facets?.withHIndex && <option value="hIndex">h-index</option>}
              {!!facets?.withCitations && <option value="citations">Citations</option>}
              <option value="name">Name</option>
            </Select>
          </label>
          <div className="flex rounded-xl bg-white p-1 shadow-card">
            <button onClick={() => setGrid(true)} className={cx('rounded-lg p-2', grid ? 'bg-brand-50 text-brand-700' : 'text-ink-mute')} aria-label="Grid view">
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setGrid(false)} className={cx('rounded-lg p-2', !grid ? 'bg-brand-50 text-brand-700' : 'text-ink-mute')} aria-label="List view">
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        <ErrorNote error={error} />
        {loading && !data ? (
          <Spinner />
        ) : !data?.items.length ? (
          <Empty title="No professors found">Try a broader research area or clear some filters.</Empty>
        ) : (
          <>
            <div className={cx(grid ? 'grid gap-4 md:grid-cols-2' : 'space-y-4', loading && 'opacity-60')}>
              {data.items.map((p, idx) => (
                <Card key={p.id} className="p-6 transition-shadow hover:shadow-lift" data-tour={idx === 0 ? 'prof-card' : undefined}>
                  <div className={cx('flex gap-5', grid ? 'flex-col' : 'flex-col md:flex-row')}>
                    <div className="flex min-w-0 flex-1 gap-5">
                      <Avatar name={p.name} src={p.photoUrl} size={grid ? 64 : 96} />
                      <div className="min-w-0">
                        <Link href={`/professors/${p.id}`} className="text-xl font-semibold hover:text-brand-700">
                          Prof. {p.name}
                        </Link>
                        <p className="mt-1 text-ink-mute">{p.title ?? p.academicRank ?? p.department}</p>
                        {!universityId && <p className="text-sm text-ink-faint">{p.universityName}{p.universityCsRank ? ` · ${p.universityCsRank.replace(/ in Computer Science/i, ' CS')}` : ''}</p>}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {[...p.researchAreas].sort((a, b) => Number(p.matchedAreas?.includes(b)) - Number(p.matchedAreas?.includes(a))).slice(0, 4).map((a) =>
                            p.matchedAreas?.includes(a) ? (
                              <span key={a} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[13px] font-medium text-emerald-700 ring-1 ring-emerald-100"><Sparkles className="h-3 w-3" />{a}</span>
                            ) : (
                              <Tag key={a}>{a}</Tag>
                            ),
                          )}
                          {p.researchAreas.length > 4 && <span className="rounded-full bg-canvas px-3 py-1 text-[13px] text-ink-mute">+{p.researchAreas.length - 4}</span>}
                        </div>
                        {!!p.matchedAreas?.length && <p className="mt-2 text-sm text-emerald-700">Matches {p.matchedAreas.length} of your interests</p>}
                        {p.acceptingStudents && <Badge tone="green" className="mt-3"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Accepting students</Badge>}
                      </div>
                    </div>
                    <div className={cx('relative shrink-0', !grid && 'md:w-72 md:border-l md:border-line-soft md:pl-6')}>
                      <button onClick={() => toggleSave(p.id)} className="absolute right-0 top-0" aria-label="Save professor">
                        <Bookmark className={cx('h-5 w-5', saved.has(p.id) ? 'fill-brand-600 text-brand-600' : 'text-brand-600')} />
                      </button>
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 pr-6">
                        {[
                          ['h-index', p.hIndex != null ? fmtNum(p.hIndex) : null],
                          ['Citations', p.citationCount != null ? fmtNum(p.citationCount) : null],
                          ['Department', p.department ?? null],
                          ['Openings', openingsText(p.openPositions)],
                        ]
                          // Hide metrics nobody has entered yet; always show department and openings.
                          .filter(([k, v]) => v != null || k === 'Department' || k === 'Openings')
                          .map(([k, v]) => (
                          <div key={k} className={k === 'Department' ? 'col-span-2' : ''}>
                            <dt className="text-[13px] font-medium text-ink-faint">{k}</dt>
                            <dd className={cx('mt-0.5', v ? 'font-semibold' : 'text-sm text-ink-faint')}>{v ?? 'Not listed'}</dd>
                          </div>
                        ))}
                      </dl>
                      <Link href={`/professors/${p.id}`} className="mt-4 block">
                        <Button variant="secondary" className="w-full">View profile</Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} noun="professors" />
          </>
        )}
      </div>

      <Card className="h-fit p-6 xl:sticky xl:top-24" data-tour="prof-filters">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-[17px] font-semibold">Filters</h3>
          <button className="text-sm font-medium text-brand-600" onClick={() => (setDraft(EMPTY), setApplied(EMPTY), setPage(1))}>
            Clear all
          </button>
        </div>
        <div className="space-y-5">
          <Field label="Department">
            <Select value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })}>
              <option value="">All departments</option>
              {facets?.departments.map((d) => <option key={d.key} value={d.key}>{d.key} ({d.count})</option>)}
            </Select>
          </Field>
          <Field label="Research area">
            <Select value={draft.researchArea} onChange={(e) => setDraft({ ...draft, researchArea: e.target.value })}>
              <option value="">All research areas</option>
              {facets?.researchAreas.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.key} ({a.count})
                </option>
              ))}
            </Select>
          </Field>
          {!!facets?.academicRanks.length && <div>
            <p className="mb-2 text-[13px] font-medium text-ink-soft">Academic rank</p>
            {(facets?.academicRanks ?? []).map((r) => (
              <label key={r.key} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" checked={draft.academicRanks.includes(r.key)} onChange={() => toggleIn('academicRanks', r.key)} />
                {r.key} <span className="text-ink-faint">({r.count})</span>
              </label>
            ))}
          </div>}
          {!!facets?.openings.length && <div>
            <p className="mb-2 text-[13px] font-medium text-ink-soft">Openings</p>
            {(facets?.openings ?? []).map((r) => (
              <label key={r.key} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" checked={draft.openings.includes(r.key)} onChange={() => toggleIn('openings', r.key)} />
                {r.key} <span className="text-ink-faint">({r.count})</span>
              </label>
            ))}
          </div>}
          {!!facets?.withHIndex && <Field label={`Minimum h-index: ${draft.minHIndex}`}>
            <input type="range" min={0} max={100} value={draft.minHIndex} onChange={(e) => setDraft({ ...draft, minHIndex: +e.target.value })} className="w-full" />
          </Field>}
          {!!facets?.withCitations && <Field label={`Minimum citations: ${fmtNum(draft.minCitations)}`}>
            <input type="range" min={0} max={50000} step={500} value={draft.minCitations} onChange={(e) => setDraft({ ...draft, minCitations: +e.target.value })} className="w-full" />
          </Field>}
          <label className="flex items-center justify-between text-sm font-medium">
            Only accepting students
            <input type="checkbox" checked={draft.acceptingStudents} onChange={(e) => setDraft({ ...draft, acceptingStudents: e.target.checked })} className="h-5 w-5" />
          </label>
          <Button variant="outline" className="w-full" onClick={apply}>
            Apply filters
          </Button>
        </div>
      </Card>
    </div>
  );
}
