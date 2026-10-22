'use client';

import { ArrowLeft, Check, GraduationCap, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useState } from 'react';
import { Button, cx, ErrorNote, Field, Input, Select, Spinner, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * First-run setup. A new student can't reach the rest of the app until these
 * essentials are saved (the API answers 403 PROFILE_SETUP_REQUIRED elsewhere).
 * Field rules mirror CompleteSetupDto in apps/api/src/modules/onboarding.
 */
interface Form {
  fullName: string;
  phone: string;
  undergradInstitution: string;
  undergradMajor: string;
  cgpa: string;
  cgpaScale: '4' | '5' | '10';
  targetDegree: 'MS' | 'PhD' | 'PostDoc';
  targetIntake: '' | 'Fall' | 'Spring' | 'Summer';
  fundingPreference: '' | 'FULLY_FUNDED' | 'PARTIAL' | 'SELF';
  preferredCountries: string[];
  researchInterests: string[];
}

const STEPS = [
  { title: 'About you', blurb: 'So professors and admins can reach you.' },
  { title: 'Your studies', blurb: 'Used to check you meet program requirements.' },
  { title: 'What you’re aiming for', blurb: 'This is what we match universities and professors against.' },
] as const;

const COUNTRIES = ['United States', 'Canada', 'Germany', 'United Kingdom', 'Australia', 'Netherlands', 'Sweden', 'Japan'];
const FUNDING: [Form['fundingPreference'], string, string][] = [
  ['FULLY_FUNDED', 'Fully funded', 'Tuition waiver and a stipend'],
  ['PARTIAL', 'Partial funding', 'Some aid, I can cover the rest'],
  ['SELF', 'Self-funded', 'I’ll pay my own way'],
];
const DEGREE: [Form['targetDegree'], string][] = [
  ['MS', 'Master’s'],
  ['PhD', 'PhD'],
  ['PostDoc', 'PostDoc'],
];
const INTAKE: Form['targetIntake'][] = ['Fall', 'Spring', 'Summer'];

const PHONE = /^\+?[0-9][0-9 -]{6,18}$/;

function errorsFor(step: number, f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (step === 0) {
    if (f.fullName.trim().length < 2) e.fullName = 'Enter your full name';
    if (!PHONE.test(f.phone.trim())) e.phone = 'Enter a phone number, e.g. +8801711000000';
  }
  if (step === 1) {
    if (f.undergradInstitution.trim().length < 2) e.undergradInstitution = 'Where did you do your bachelor’s?';
    if (f.undergradMajor.trim().length < 2) e.undergradMajor = 'Enter your major';
    const g = Number(f.cgpa);
    if (!f.cgpa || Number.isNaN(g) || g < 0) e.cgpa = 'Enter your CGPA';
    else if (g > Number(f.cgpaScale)) e.cgpa = `Can’t be above ${f.cgpaScale}`;
  }
  if (step === 2) {
    if (!f.targetIntake) e.targetIntake = 'Pick an intake';
    if (!f.fundingPreference) e.fundingPreference = 'Pick one';
    if (!f.preferredCountries.length) e.preferredCountries = 'Add at least one country';
    if (!f.researchInterests.length) e.researchInterests = 'Add at least one research interest';
  }
  return e;
}

export default function WelcomePage() {
  const { me, loading, refresh, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState<Form | null>(null);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [areas, setAreas] = useState<string[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace('/login');
    else if (me.role !== 'GU') router.replace('/admin');
    else if (me.setupDone) router.replace('/dashboard');
  }, [me, loading, router]);

  // Prefill from what they gave at sign-up (name, degree) or a half-finished earlier attempt.
  useEffect(() => {
    if (!me || me.role !== 'GU' || me.setupDone) return;
    api<Record<string, unknown>>('/profile')
      .then((p) =>
        setF({
          fullName: String(p.fullName ?? ''),
          phone: String(p.phone ?? ''),
          undergradInstitution: String(p.undergradInstitution ?? ''),
          undergradMajor: String(p.undergradMajor ?? ''),
          cgpa: p.cgpa == null ? '' : String(p.cgpa),
          cgpaScale: (['4', '5', '10'].includes(String(p.cgpaScale)) ? String(p.cgpaScale) : '4') as Form['cgpaScale'],
          targetDegree: (p.targetDegree as Form['targetDegree']) ?? 'MS',
          targetIntake: (p.targetIntake as Form['targetIntake']) ?? '',
          fundingPreference: (p.fundingPreference as Form['fundingPreference']) ?? '',
          preferredCountries: (p.preferredCountries as string[]) ?? [],
          researchInterests: (p.researchInterests as string[]) ?? [],
        }),
      )
      .catch((e) => setErr(e));
    api<{ researchAreas: { key: string }[] }>('/universities/facets')
      .then((x) => setAreas(x.researchAreas.map((a) => a.key).slice(0, 14)))
      .catch(() => null);
  }, [me]);

  if (!f || !me) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Spinner />
      </div>
    );
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v });
  const errors = touched ? errorsFor(step, f) : {};

  const next = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errorsFor(step, f)).length) return;
    setTouched(false);
    if (step < STEPS.length - 1) return setStep(step + 1);
    setBusy(true);
    setErr(null);
    try {
      await api('/onboarding/setup', {
        method: 'POST',
        json: {
          ...f,
          fullName: f.fullName.trim(),
          phone: f.phone.trim(),
          cgpa: Number(f.cgpa),
          cgpaScale: Number(f.cgpaScale),
        },
      });
      await refresh();
      toast('You’re all set. Here’s your dashboard.');
      router.replace('/dashboard');
    } catch (x) {
      setErr(x as ApiError);
      setBusy(false);
    }
  };

  const first = f.fullName.trim().split(/\s+/)[0] || 'there';

  return (
    <div className="grid min-h-screen bg-canvas p-3 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-3">
      {/* Progress + live preview of what they've told us */}
      <aside className="sticky top-3 hidden h-[calc(100vh-24px)] flex-col rounded-[28px] bg-night p-8 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/10">
            <GraduationCap className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">HigherStudy</span>
        </div>
        <ol className="mt-12 space-y-1">
          {STEPS.map((s, n) => (
            <li key={s.title} className={cx('flex items-start gap-3 rounded-2xl px-3 py-3', n === step && 'bg-white/[0.07]')}>
              <span
                className={cx(
                  'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  n < step ? 'bg-emerald-400 text-night' : n === step ? 'bg-white text-night' : 'bg-white/10 text-white/60',
                )}
              >
                {n < step ? <Check className="h-3.5 w-3.5" /> : n + 1}
              </span>
              <span>
                <span className={cx('block text-[15px]', n === step ? 'font-medium text-white' : 'text-white/70')}>{s.title}</span>
                {n === step && <span className="mt-0.5 block text-[13px] text-brand-200">{s.blurb}</span>}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-auto rounded-2xl bg-white/[0.06] p-5">
          <p className="text-[13px] text-brand-200">What we’ll match you on</p>
          <p className="mt-2 text-[17px] font-medium leading-snug">
            {DEGREE.find(([v]) => v === f.targetDegree)?.[1]}
            {f.targetIntake && `, ${f.targetIntake} intake`}
          </p>
          <p className="mt-1 text-sm text-brand-100">
            {f.fundingPreference ? FUNDING.find(([v]) => v === f.fundingPreference)?.[1] : 'Funding preference not set'}
            {f.preferredCountries.length > 0 && ` · ${f.preferredCountries.slice(0, 2).join(', ')}${f.preferredCountries.length > 2 ? ` +${f.preferredCountries.length - 2}` : ''}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {f.researchInterests.length ? (
              f.researchInterests.slice(0, 5).map((r) => (
                <span key={r} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white">{r}</span>
              ))
            ) : (
              <span className="text-xs text-white/50">Research interests appear here</span>
            )}
          </div>
        </div>
      </aside>

      <main className="flex flex-col rounded-[28px] bg-white px-6 py-8 sm:px-12 lg:py-12">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-mute">
            Step {step + 1} of {STEPS.length}
          </p>
          <button onClick={() => logout()} className="text-sm text-ink-mute hover:text-ink">
            Log out
          </button>
        </div>
        {/* Thin progress bar for small screens, where the side panel is hidden */}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-canvas lg:hidden">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        <form onSubmit={next} className="mx-auto mt-10 w-full max-w-xl flex-1" noValidate>
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-ink">
            {step === 0 ? `Welcome, ${first}. Let’s set up your profile.` : STEPS[step].title}
          </h1>
          <p className="mt-2 text-[15px] text-ink-mute">
            {step === 0 ? 'Three short steps. You can add scores, publications and experience later from your profile.' : STEPS[step].blurb}
          </p>

          <div key={step} className="mt-8 animate-fade-up space-y-5">
            {step === 0 && (
              <>
                <Field label="Full name" error={errors.fullName}>
                  <Input autoFocus value={f.fullName} onChange={(e) => set('fullName', e.target.value)} autoComplete="name" />
                </Field>
                <Field label="Phone" hint="Bangladeshi or international format" error={errors.phone}>
                  <Input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+8801711000000" autoComplete="tel" />
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <Field label="Undergraduate institution" error={errors.undergradInstitution}>
                  <Input autoFocus value={f.undergradInstitution} onChange={(e) => set('undergradInstitution', e.target.value)} placeholder="e.g. BUET" />
                </Field>
                <Field label="Major" error={errors.undergradMajor}>
                  <Input value={f.undergradMajor} onChange={(e) => set('undergradMajor', e.target.value)} placeholder="e.g. Computer Science and Engineering" />
                </Field>
                <div className="grid grid-cols-[1fr_140px] gap-3">
                  <Field label="CGPA" error={errors.cgpa}>
                    <Input type="number" inputMode="decimal" step="0.01" min={0} value={f.cgpa} onChange={(e) => set('cgpa', e.target.value)} placeholder="3.50" />
                  </Field>
                  <Field label="Out of">
                    <Select value={f.cgpaScale} onChange={(e) => set('cgpaScale', e.target.value as Form['cgpaScale'])}>
                      <option value="4">4.0</option>
                      <option value="5">5.0</option>
                      <option value="10">10</option>
                    </Select>
                  </Field>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <Group label="Degree">
                  <Choices value={f.targetDegree} onChange={(v) => set('targetDegree', v)} options={DEGREE.map(([v, l]) => ({ value: v, label: l }))} />
                </Group>
                <Group label="Intake" error={errors.targetIntake}>
                  <Choices value={f.targetIntake} onChange={(v) => set('targetIntake', v)} options={INTAKE.map((v) => ({ value: v, label: v }))} />
                </Group>
                <Group label="Funding" error={errors.fundingPreference}>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {FUNDING.map(([v, l, d]) => (
                      <button
                        type="button"
                        key={v}
                        onClick={() => set('fundingPreference', v)}
                        aria-pressed={f.fundingPreference === v}
                        className={cx(
                          'rounded-2xl border px-4 py-3 text-left transition-colors',
                          f.fundingPreference === v ? 'border-brand-500 bg-brand-25 ring-4 ring-brand-100' : 'border-line hover:border-slate-300',
                        )}
                      >
                        <span className="block text-sm font-medium text-ink">{l}</span>
                        <span className="mt-0.5 block text-xs text-ink-mute">{d}</span>
                      </button>
                    ))}
                  </div>
                </Group>
                <Group label="Countries you’d study in" error={errors.preferredCountries}>
                  <ChipInput values={f.preferredCountries} onChange={(v) => set('preferredCountries', v)} suggestions={COUNTRIES} placeholder="Add a country" max={10} />
                </Group>
                <Group label="Research interests" error={errors.researchInterests}>
                  <ChipInput values={f.researchInterests} onChange={(v) => set('researchInterests', v)} suggestions={areas} placeholder="e.g. Machine Learning" max={15} />
                </Group>
              </>
            )}
          </div>

          <div className="mt-6">
            <ErrorNote error={err} />
          </div>

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-line-soft pt-6">
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" size="lg" loading={busy}>
              {step < STEPS.length - 1 ? 'Continue' : 'Finish setup'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Group({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium text-ink">{label}</legend>
      {children}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </fieldset>
  );
}

function Choices<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cx(
            'h-10 rounded-xl border px-4 text-sm transition-colors',
            value === o.value ? 'border-brand-500 bg-brand-25 font-medium text-brand-700 ring-4 ring-brand-100' : 'border-line text-ink-soft hover:border-slate-300',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Free-text chips with one-tap suggestions. Enter or comma adds; Backspace on empty removes the last. */
function ChipInput({ values, onChange, suggestions, placeholder, max }: { values: string[]; onChange: (v: string[]) => void; suggestions: string[]; placeholder: string; max: number }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, '');
    if (!v || values.length >= max || values.some((x) => x.toLowerCase() === v.toLowerCase())) return setText('');
    onChange([...values, v]);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1));
  };
  const left = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8);
  return (
    <div>
      <div className="flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-xl border border-line bg-white px-2 py-1.5 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-[13px] font-medium text-brand-700">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Remove ${v}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => text && add(text)}
          placeholder={values.length ? '' : placeholder}
          className="min-w-[140px] flex-1 bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-ink-faint focus-visible:outline-none"
        />
      </div>
      {left.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {left.map((s) => (
            <button type="button" key={s} onClick={() => add(s)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-ink-soft hover:border-brand-300 hover:text-brand-700">
              <Plus className="h-3 w-3" /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
