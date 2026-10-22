'use client';

import { Plus, Trash2, X } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { Button, Card, cx, ErrorNote, Field, Input, PageHeader, Select, Spinner, useToast } from '@/components/ui';
import { api, ApiError, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Pub = { title: string; venue?: string; year?: string };
type Exp = { role: string; organization: string; years?: string };
interface Profile {
  fullName: string;
  phone?: string | null;
  undergradInstitution?: string | null;
  undergradMajor?: string | null;
  graduationYear?: number | null;
  cgpa?: number | null;
  cgpaScale?: number | null;
  greScore?: number | null;
  ieltsScore?: number | null;
  toeflScore?: number | null;
  targetDegree: string;
  fundingPreference?: string | null;
  targetIntake?: string | null;
  preferredCountries: string[];
  researchInterests: string[];
  publications?: Pub[] | null;
  experience?: Exp[] | null;
}

const TABS = ['Personal', 'Academic', 'Test Scores', 'Research', 'Experience', 'Preferences'] as const;
type Tab = (typeof TABS)[number];

function Choice<T extends string>({ options, value, onChange }: { options: [T, string][]; value?: T | null; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-4">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cx('flex w-56 items-center gap-3 rounded-xl border px-5 py-4 text-left text-[15px] transition', value === v ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-line text-ink-soft hover:border-brand-200')}
        >
          <span className={cx('grid h-5 w-5 place-items-center rounded-full border-2', value === v ? 'border-brand-600' : 'border-slate-300')}>
            {value === v && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
          </span>
          {label}
        </button>
      ))}
    </div>
  );
}

function Chips({ values, onChange, placeholder, addLabel }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; addLabel: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-5">
      {values.map((c) => (
        <span key={c} className="flex items-center gap-2 rounded-lg border border-brand-200 px-4 py-2 text-[15px] text-brand-700">
          {c}
          <button onClick={() => onChange(values.filter((x) => x !== c))} aria-label={`Remove ${c}`}><X className="h-4 w-4" /></button>
        </span>
      ))}
      <span className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-1">
        <Plus className="h-4 w-4 text-ink-faint" />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} onBlur={add} placeholder={placeholder || addLabel} className="w-32 bg-transparent py-1 text-[15px] outline-none placeholder:text-ink-mute" />
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const { refresh } = useAuth();
  const { data, error } = useApi<Profile>('/profile');
  const [tab, setTab] = useState<Tab>('Personal');
  const [p, setP] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const toast = useToast();
  const [err, setErr] = useState<ApiError | null>(null);
  useEffect(() => setP(data), [data]);
  if (error) return <ErrorNote error={error} />;
  if (!p) return <Spinner />;

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => (setP({ ...p, [k]: v }), setSaved(false));
  const num = (v: string) => (v === '' ? null : Number(v));

  const save = async () => {
    setSaving(true);
    setErr(null);
    const { fullName, phone, undergradInstitution, undergradMajor, graduationYear, cgpa, cgpaScale, greScore, ieltsScore, toeflScore, targetDegree, fundingPreference, targetIntake, preferredCountries, researchInterests, publications, experience } = p;
    const body = { fullName, phone, undergradInstitution, undergradMajor, graduationYear, cgpa, cgpaScale, greScore, ieltsScore, toeflScore, targetDegree, fundingPreference, targetIntake, preferredCountries, researchInterests, publications: publications ?? [], experience: experience ?? [] };
    try {
      await api('/profile', { method: 'PATCH', json: Object.fromEntries(Object.entries(body).filter(([, v]) => v !== null && v !== '')) });
      setSaved(true);
      toast('Profile saved');
      refresh();
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setSaving(false);
    }
  };

  const panels: Record<Tab, ReactNode> = {
    Personal: (
      <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
        <Field label="Full name"><Input value={p.fullName} onChange={(e) => set('fullName', e.target.value)} /></Field>
        <Field label="Phone"><Input value={p.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+8801…" /></Field>
      </div>
    ),
    Academic: (
      <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
        <Field label="Undergraduate institution"><Input value={p.undergradInstitution ?? ''} onChange={(e) => set('undergradInstitution', e.target.value)} /></Field>
        <Field label="Major"><Input value={p.undergradMajor ?? ''} onChange={(e) => set('undergradMajor', e.target.value)} /></Field>
        <Field label="Graduation year"><Input type="number" value={p.graduationYear ?? ''} onChange={(e) => set('graduationYear', num(e.target.value))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CGPA"><Input type="number" step="0.01" value={p.cgpa ?? ''} onChange={(e) => set('cgpa', num(e.target.value))} /></Field>
          <Field label="Scale"><Input type="number" step="0.5" value={p.cgpaScale ?? 4} onChange={(e) => set('cgpaScale', num(e.target.value))} /></Field>
        </div>
        <Field label="Target degree">
          <Select value={p.targetDegree} onChange={(e) => set('targetDegree', e.target.value)}>
            <option value="MS">Master's</option><option value="PhD">PhD</option><option value="PostDoc">PostDoc</option>
          </Select>
        </Field>
      </div>
    ),
    'Test Scores': (
      <div className="grid max-w-3xl gap-5 sm:grid-cols-3">
        <Field label="GRE (260–340)"><Input type="number" value={p.greScore ?? ''} onChange={(e) => set('greScore', num(e.target.value))} /></Field>
        <Field label="IELTS overall"><Input type="number" step="0.5" value={p.ieltsScore ?? ''} onChange={(e) => set('ieltsScore', num(e.target.value))} /></Field>
        <Field label="TOEFL iBT"><Input type="number" value={p.toeflScore ?? ''} onChange={(e) => set('toeflScore', num(e.target.value))} /></Field>
      </div>
    ),
    Research: (
      <div className="space-y-8">
        <div>
          <p className="mb-4 text-[15px] font-semibold text-ink">Research interests</p>
          <Chips values={p.researchInterests} onChange={(v) => set('researchInterests', v)} placeholder="Add Interest" addLabel="Add Interest" />
        </div>
        <ListEditor<Pub>
          title="Publications"
          rows={p.publications ?? []}
          onChange={(v) => set('publications', v)}
          blank={{ title: '', venue: '', year: '' }}
          cols={[['title', 'Title', 'flex-[3]'], ['venue', 'Venue', 'flex-[2]'], ['year', 'Year', 'w-24']]}
        />
      </div>
    ),
    Experience: (
      <ListEditor<Exp>
        title="Research & work experience"
        rows={p.experience ?? []}
        onChange={(v) => set('experience', v)}
        blank={{ role: '', organization: '', years: '' }}
        cols={[['role', 'Role', 'flex-[2]'], ['organization', 'Organization', 'flex-[2]'], ['years', 'Years', 'w-32']]}
      />
    ),
    Preferences: (
      <div className="space-y-10">
        <div>
          <p className="mb-4 text-[15px] font-semibold text-ink">Funding preference</p>
          <Choice value={p.fundingPreference} onChange={(v) => set('fundingPreference', v)} options={[['FULLY_FUNDED', 'Fully Funded'], ['PARTIAL', 'Partial Funded'], ['SELF', 'Self Funded']]} />
        </div>
        <div>
          <p className="mb-4 text-[15px] font-semibold text-ink">Target intake</p>
          <Choice value={p.targetIntake} onChange={(v) => set('targetIntake', v)} options={[['Fall', 'Fall'], ['Spring', 'Spring']]} />
        </div>
        <div>
          <p className="mb-4 text-[15px] font-semibold text-ink">Preferred countries</p>
          <Chips values={p.preferredCountries} onChange={(v) => set('preferredCountries', v)} placeholder="Add Country" addLabel="Add Country" />
        </div>
      </div>
    ),
  };

  return (
    <div>
      <PageHeader title="Your profile" subtitle="The more you add, the better your university and professor matches get." />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" data-tour="profile-tabs" aria-label="Profile sections">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? 'page' : undefined}
              className={cx('shrink-0 rounded-xl px-4 py-2.5 text-left text-[15px] transition-colors', tab === t ? 'bg-white font-medium text-brand-700 shadow-lift' : 'text-ink-soft hover:bg-white/70 hover:text-ink')}
            >
              {t}
            </button>
          ))}
        </nav>
        <Card className="p-6 sm:p-10">
          <h2 className="mb-8 text-[22px] font-semibold tracking-tight">{tab}</h2>
          <ErrorNote error={err} />
          {panels[tab]}
          <div className="mt-10 flex items-center justify-end gap-4 border-t border-line-soft pt-6">
            {saved && <span className="text-sm text-emerald-600">All changes saved</span>}
            <Button size="lg" onClick={save} loading={saving} className="px-8" data-tour="profile-save">Save changes</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ListEditor<T extends Record<string, string | undefined>>({ title, rows, onChange, blank, cols }: { title: string; rows: T[]; onChange: (v: T[]) => void; blank: T; cols: [keyof T & string, string, string][] }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        <Button size="sm" variant="secondary" onClick={() => onChange([...rows, { ...blank }])}><Plus className="h-3.5 w-3.5" /> Add</Button>
      </div>
      {!rows.length && <p className="text-sm text-ink-mute">Nothing added yet.</p>}
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3">
            {cols.map(([k, label, w]) => (
              <Input key={k} className={cx('min-w-[120px]', w)} placeholder={label} value={r[k] ?? ''} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
            ))}
            <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="p-2 text-ink-faint hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
