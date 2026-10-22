'use client';

import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, cx, ErrorNote, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Textarea } from '@/components/ui';
import { api, ApiError, qs, useApi } from '@/lib/api';
import { FUNDING, fmtNum } from '@/lib/format';
import type { Paged, ProfessorRow, Program, University } from '@/lib/types';

/**
 * Directory management. Admins enter text exactly as published (rank text,
 * fee, GRE/IELTS wording, funding policy); the API derives the filterable
 * columns from it on every save, purges hs:univ:* / hs:prof:* and audits the change.
 */
export default function DirectoryPage() {
  const [tab, setTab] = useState<'universities' | 'programs' | 'professors'>('universities');
  return (
    <div>
      <PageHeader
        title="Directory"
        subtitle="Universities, programs and professors that students search. changes appear immediately."
        actions={<Link href="/admin/imports"><Button variant="outline"><Upload className="h-4 w-4" /> Import CSV</Button></Link>}
      />
      <div className="mb-5 flex gap-6 border-b border-line">
        {(['universities', 'programs', 'professors'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx('-mb-px border-b-2 pb-3 capitalize', tab === t ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-ink-mute')}>{t}</button>
        ))}
      </div>
      {tab === 'universities' ? <Universities /> : tab === 'programs' ? <Programs /> : <Professors />}
    </div>
  );
}

function useSave<T>(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const save = async (path: string, method: 'POST' | 'PATCH', json: T) => {
    setBusy(true);
    setErr(null);
    try {
      await api(path, { method, json });
      onDone();
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, save };
}

// ------------------------------------------------------------------ universities
const uBlank = { name: '', location: '', csRank: '', wesRequired: false };

function Universities() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const { data, loading, reload } = useApi<Paged<University>>('/universities' + qs({ q, page, pageSize: 20, sort: 'rank' }));
  const [edit, setEdit] = useState<{ id?: string; f: typeof uBlank } | null>(null);
  const { busy, err, save } = useSave(() => (setEdit(null), reload()));

  const remove = async (u: University) => {
    if (!confirm(`Delete ${u.name}? This also deletes its programs, professors, and every student application and outreach thread linked to them.`)) return;
    await api(`/universities/${u.id}`, { method: 'DELETE' });
    reload();
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Input className="w-72" placeholder="Search universities…" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
        <Button onClick={() => setEdit({ f: uBlank })}><Plus className="h-4 w-4" /> Add university</Button>
      </div>
      <Card className="overflow-hidden">
        {loading && !data ? <Spinner /> : (
          <table className="w-full text-sm">
            <thead className="bg-brand-25 text-left text-[13px] font-medium text-ink-mute">
              <tr><th className="px-6 py-3">University</th><th className="px-4 py-3">CS rank (as published)</th><th className="px-4 py-3">Parsed</th><th className="px-4 py-3">WES</th><th className="px-4 py-3">Programs</th><th className="px-4 py-3">Faculty</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {data?.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-6 py-3 font-medium">{u.name}<p className="font-normal text-ink-mute">{u.location} <span className="font-mono text-xs text-ink-faint">· {u.id}</span></p></td>
                  <td className="px-4 py-3 text-ink-soft">{u.csRank ?? '—'}</td>
                  <td className="px-4 py-3">{u.csRankPosition ? `#${u.csRankPosition}${u.csRankTied ? ' tie' : ''}` : <span className="text-amber-600">—</span>}</td>
                  <td className="px-4 py-3">{u.wesRequired ? <Badge tone="amber">Yes</Badge> : 'No'}</td>
                  <td className="px-4 py-3">{u._count?.programs ?? 0}</td>
                  <td className="px-4 py-3">{u._count?.professors ?? 0}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="p-2 text-ink-faint hover:text-brand-600" aria-label="Edit" onClick={() => setEdit({ id: u.id, f: { name: u.name, location: u.location, csRank: u.csRank ?? '', wesRequired: u.wesRequired } })}><Pencil className="h-4 w-4" /></button>
                    <button className="p-2 text-ink-faint hover:text-red-600" aria-label="Delete" onClick={() => remove(u)}><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && <div className="border-t border-line px-5"><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} noun="universities" /></div>}
      </Card>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Edit university' : 'Add university'}
          footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} disabled={!edit.f.name || !edit.f.location} onClick={() => save(edit.id ? `/universities/${edit.id}` : '/universities', edit.id ? 'PATCH' : 'POST', { ...edit.f, csRank: edit.f.csRank || undefined })}>Save</Button></>}>
          <div className="space-y-4">
            <ErrorNote error={err} />
            <Field label="Name" required><Input value={edit.f.name} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, name: e.target.value } })} /></Field>
            <Field label="Location" required hint='"City, ST" for US universities — state and country are derived.'><Input value={edit.f.location} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, location: e.target.value } })} placeholder="Philadelphia, PA" /></Field>
            <Field label="CS rank" hint="Paste the published text; the rank number and tie are parsed from it."><Input value={edit.f.csRank} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, csRank: e.target.value } })} placeholder="#74 in Computer Science (tie)" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.f.wesRequired} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, wesRequired: e.target.checked } })} /> WES credential evaluation required</label>
          </div>
        </Modal>
      )}
    </>
  );
}

// ------------------------------------------------------------------ programs
const pgBlank = {
  universityId: '', programName: '', degreeLevel: 'PhD', catalogLink: '', deadlineDate: '', applicationFee: '', feeWaiverType: '',
  feeWaiverInfo: '', greRequirement: '', ieltsRequirement: '', financialAidPolicy: '', limitationsNotes: '',
};
type PgForm = typeof pgBlank;

function Programs() {
  const unis = useApi<Paged<University>>('/universities?pageSize=100&sort=rank').data;
  const [uni, setUni] = useState('');
  const { data, loading, reload } = useApi<Program[]>('/programs' + qs({ universityId: uni }));
  const [edit, setEdit] = useState<{ id?: string; f: PgForm } | null>(null);
  const { busy, err, save } = useSave(() => (setEdit(null), reload()));

  const submit = () => {
    if (!edit) return;
    const body: Record<string, string | undefined> = Object.fromEntries(Object.entries(edit.f).map(([k, v]) => [k, v.trim() || undefined]));
    if (edit.id) delete body.universityId;
    save(edit.id ? `/programs/${edit.id}` : '/programs', edit.id ? 'PATCH' : 'POST', body);
  };
  const remove = async (p: Program) => {
    if (!confirm(`Delete ${p.programName}? Student applications to it are deleted too.`)) return;
    await api(`/programs/${p.id}`, { method: 'DELETE' });
    reload();
  };
  const field = (k: keyof PgForm, label: string, opts: { area?: boolean; hint?: string; placeholder?: string } = {}) =>
    edit && (
      <Field label={label} hint={opts.hint}>
        {opts.area ? (
          <Textarea rows={2} value={edit.f[k]} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, [k]: e.target.value } })} placeholder={opts.placeholder} />
        ) : (
          <Input value={edit.f[k]} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, [k]: e.target.value } })} placeholder={opts.placeholder} />
        )}
      </Field>
    );

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Select className="w-80" value={uni} onChange={(e) => setUni(e.target.value)}>
          <option value="">All universities</option>
          {unis?.items.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <Button onClick={() => setEdit({ f: { ...pgBlank, universityId: uni || unis?.items[0]?.id || '' } })}><Plus className="h-4 w-4" /> Add program</Button>
      </div>
      <Card className="overflow-hidden">
        {loading && !data ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-brand-25 text-left text-[13px] font-medium text-ink-mute">
                <tr><th className="px-6 py-3">Program</th><th className="px-4 py-3">Deadline</th><th className="px-4 py-3">Fee</th><th className="px-4 py-3">GRE</th><th className="px-4 py-3">IELTS min</th><th className="px-4 py-3">Funding (parsed)</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {data?.map((p) => (
                  <tr key={p.id}>
                    <td className="px-6 py-3 font-medium">{p.programName}<p className="font-normal text-ink-mute">{p.university?.name} · {p.degreeLevel}</p></td>
                    <td className="px-4 py-3">{p.deadlineDate ?? <span className="text-amber-600">Missing</span>}</td>
                    <td className="px-4 py-3">{p.applicationFee ?? '—'}</td>
                    <td className="px-4 py-3">{p.greRequired == null ? '—' : p.greRequired ? 'Required' : 'Not required'}</td>
                    <td className="px-4 py-3">{p.ieltsMinOverall ?? '—'}</td>
                    <td className="px-4 py-3">{p.fundingLevel ? <Badge tone={FUNDING[p.fundingLevel].tone}>{p.fundingLevel.toLowerCase()}</Badge> : <span className="text-amber-600">Unclassified</span>}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button className="p-2 text-ink-faint hover:text-brand-600" aria-label="Edit" onClick={() => setEdit({ id: p.id, f: Object.fromEntries(Object.keys(pgBlank).map((k) => [k, ((p as unknown as Record<string, unknown>)[k] as string) ?? ''])) as PgForm })}><Pencil className="h-4 w-4" /></button>
                      <button className="p-2 text-ink-faint hover:text-red-600" aria-label="Delete" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
                {!data?.length && <tr><td colSpan={7} className="px-6 py-10 text-center text-ink-mute">No programs.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {edit && (
        <Modal open wide onClose={() => setEdit(null)} title={edit.id ? 'Edit program' : 'Add program'} subtitle="Enter text as the university publishes it; fees, GRE, IELTS and funding are parsed from it."
          footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} disabled={!edit.f.programName || !edit.f.universityId} onClick={submit}>Save</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><ErrorNote error={err} /></div>
            <Field label="University" required>
              <Select value={edit.f.universityId} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, universityId: e.target.value } })}>
                {unis?.items.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field label="Degree level" required>
              <Select value={edit.f.degreeLevel} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, degreeLevel: e.target.value } })}><option>PhD</option><option>MS</option><option>PostDoc</option></Select>
            </Field>
            {field('programName', 'Program name', { placeholder: 'Computer Science, PhD' })}
            {field('catalogLink', 'Catalog link', { placeholder: 'https://…' })}
            {field('deadlineDate', 'Deadline', { placeholder: 'Dec 15' })}
            {field('applicationFee', 'Application fee', { placeholder: '$80' })}
            {field('feeWaiverType', 'Fee waiver type', { placeholder: 'Central Request / Open House / None' })}
            {field('feeWaiverInfo', 'Fee waiver details')}
            {field('greRequirement', 'GRE requirement', { placeholder: 'Official GRE Required' })}
            {field('ieltsRequirement', 'IELTS / English requirement', { placeholder: '7.0 overall (6.5 min per sub-score)' })}
            <div className="sm:col-span-2">{field('financialAidPolicy', 'Financial aid policy', { area: true, hint: 'Classified as guaranteed / available / conditional from the wording.' })}</div>
            <div className="sm:col-span-2">{field('limitationsNotes', 'Other requirements', { area: true, hint: 'Mentions of WES and LOR counts are picked up automatically.' })}</div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ------------------------------------------------------------------ professors
const pBlank = { universityId: '', name: '', title: '', academicRank: '', email: '', department: '', researchAreas: '', hIndex: '', citationCount: '', profileLink: '', googleScholarLink: '', labWebsite: '', acceptingStudents: true, bio: '' };

function Professors() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const unis = useApi<Paged<University>>('/universities?pageSize=100&sort=rank').data;
  const [data, setData] = useState<Paged<ProfessorRow> | null>(null);
  const [nonce, setNonce] = useState(0);
  const [edit, setEdit] = useState<{ id?: string; f: typeof pBlank } | null>(null);
  const { busy, err, save } = useSave(() => (setEdit(null), setNonce((n) => n + 1)));

  useEffect(() => {
    api<Paged<ProfessorRow>>('/professors/search', { method: 'POST', json: { q: q || undefined, page, pageSize: 15, sort: 'name' } }).then(setData).catch(() => undefined);
  }, [q, page, nonce]);

  const submit = () => {
    if (!edit) return;
    const f = edit.f;
    const opt = (v: string) => v.trim() || undefined;
    save(edit.id ? `/professors/${edit.id}` : '/professors', edit.id ? 'PATCH' : 'POST', {
      universityId: f.universityId, name: f.name, title: opt(f.title), academicRank: opt(f.academicRank), email: opt(f.email), department: opt(f.department),
      bio: opt(f.bio), profileLink: opt(f.profileLink), googleScholarLink: opt(f.googleScholarLink), labWebsite: opt(f.labWebsite),
      researchAreas: f.researchAreas.split(/[;,]/).map((s) => s.trim()).filter(Boolean),
      hIndex: f.hIndex ? +f.hIndex : undefined, citationCount: f.citationCount ? +f.citationCount : undefined, acceptingStudents: f.acceptingStudents,
    });
  };
  const remove = async (p: ProfessorRow) => {
    if (!confirm(`Delete Prof. ${p.name}? Student outreach threads with this professor are deleted too.`)) return;
    await api(`/professors/${p.id}`, { method: 'DELETE' });
    setNonce((n) => n + 1);
  };
  const set = (k: keyof typeof pBlank, v: string | boolean) => edit && setEdit({ ...edit, f: { ...edit.f, [k]: v } });

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Input className="w-72" placeholder="Search professors…" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
        <Button onClick={() => setEdit({ f: { ...pBlank, universityId: unis?.items[0]?.id ?? '' } })}><Plus className="h-4 w-4" /> Add professor</Button>
      </div>
      <Card className="overflow-hidden">
        {!data ? <Spinner /> : (
          <table className="w-full text-sm">
            <thead className="bg-brand-25 text-left text-[13px] font-medium text-ink-mute"><tr><th className="px-6 py-3">Professor</th><th className="px-4 py-3">University</th><th className="px-4 py-3">Research areas</th><th className="px-4 py-3">h-index</th><th className="px-4 py-3">Links</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y divide-line-soft">
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td className="px-6 py-3 font-medium">{p.name}<p className="font-normal text-ink-mute">{p.email ?? '—'}</p></td>
                  <td className="px-4 py-3">{p.universityName}</td>
                  <td className="max-w-[280px] px-4 py-3 text-ink-soft">{p.researchAreas.join(', ')}</td>
                  <td className="px-4 py-3">{p.hIndex != null ? fmtNum(p.hIndex) : <span className="text-amber-600">—</span>}</td>
                  <td className="px-4 py-3 text-ink-faint">—</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button className="p-2 text-ink-faint hover:text-brand-600" aria-label="Edit" onClick={async () => {
                      const d = await api<Record<string, unknown>>(`/professors/${p.id}`);
                      const str = (k: string) => (d[k] == null ? '' : String(d[k]));
                      setEdit({ id: p.id, f: { universityId: p.universityId, name: p.name, title: str('title'), academicRank: str('academicRank'), email: str('email'), department: str('department'), researchAreas: p.researchAreas.join('; '), hIndex: str('hIndex'), citationCount: str('citationCount'), profileLink: str('profileLink'), googleScholarLink: str('googleScholarLink'), labWebsite: str('labWebsite'), acceptingStudents: p.acceptingStudents, bio: str('bio') } });
                    }}><Pencil className="h-4 w-4" /></button>
                    <button className="p-2 text-ink-faint hover:text-red-600" aria-label="Delete" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && <div className="border-t border-line px-5"><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} noun="professors" /></div>}
      </Card>
      {edit && (
        <Modal open wide onClose={() => setEdit(null)} title={edit.id ? 'Edit professor' : 'Add professor'}
          footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} disabled={!edit.f.name || !edit.f.universityId} onClick={submit}>Save</Button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><ErrorNote error={err} /></div>
            <Field label="University" required><Select value={edit.f.universityId} onChange={(e) => set('universityId', e.target.value)}>{unis?.items.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
            <Field label="Name" required hint='Without "Prof." — it is stripped automatically.'><Input value={edit.f.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={edit.f.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Department"><Input value={edit.f.department} onChange={(e) => set('department', e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Research areas" hint="Separate with ; or ,"><Input value={edit.f.researchAreas} onChange={(e) => set('researchAreas', e.target.value)} placeholder="Machine Learning; Computer Vision" /></Field></div>
            <Field label="Title" optional><Input value={edit.f.title} onChange={(e) => set('title', e.target.value)} placeholder="Associate Professor of Computer Science" /></Field>
            <Field label="Academic rank" optional><Select value={edit.f.academicRank} onChange={(e) => set('academicRank', e.target.value)}><option value="">—</option><option>Professor</option><option>Associate professor</option><option>Assistant professor</option><option>Lecturer</option><option>Research scientist</option></Select></Field>
            <Field label="Faculty page" optional><Input value={edit.f.profileLink} onChange={(e) => set('profileLink', e.target.value)} placeholder="https://…" /></Field>
            <Field label="Google Scholar" optional><Input value={edit.f.googleScholarLink} onChange={(e) => set('googleScholarLink', e.target.value)} placeholder="https://scholar.google.com/…" /></Field>
            <Field label="Lab website" optional><Input value={edit.f.labWebsite} onChange={(e) => set('labWebsite', e.target.value)} placeholder="https://…" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="h-index"><Input type="number" min={0} value={edit.f.hIndex} onChange={(e) => set('hIndex', e.target.value)} /></Field>
              <Field label="Citations"><Input type="number" min={0} value={edit.f.citationCount} onChange={(e) => set('citationCount', e.target.value)} /></Field>
            </div>
            <div className="sm:col-span-2"><Field label="Bio" optional><Textarea value={edit.f.bio} onChange={(e) => set('bio', e.target.value)} /></Field></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.f.acceptingStudents} onChange={(e) => set('acceptingStudents', e.target.checked)} /> Accepting students</label>
          </div>
        </Modal>
      )}
    </>
  );
}
