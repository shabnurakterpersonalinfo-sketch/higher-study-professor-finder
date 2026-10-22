'use client';

import { CalendarDays, FileText, Flag, Info, Landmark, Send, Trash2 } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { api, ApiError, useApi } from '@/lib/api';
import { APP, APP_ORDER } from '@/lib/format';
import type { Application, AppStatus, Paged, University } from '@/lib/types';
import { Button, Card, ErrorNote, Field, Input, Modal, Select, StepRail, Textarea, Toggle2 } from './ui';

const DOCS = [
  ['officialTranscriptSubmitted', 'Official Transcript'],
  ['lor1Submitted', 'LOR 1'],
  ['lor2Submitted', 'LOR 2'],
  ['lor3Submitted', 'LOR 3'],
  ['sopSubmitted', 'SOP / Personal Statement'],
  ['cvSubmitted', 'Resume / CV'],
] as const;

type Form = {
  universityId: string;
  programId: string;
  department: string;
  programType: string;
  intakeTerm: string;
  applicationRound: string;
  appliedAt: string;
  deadline: string;
  expectedDecisionDate: string;
  enrollmentDate: string;
  status: AppStatus;
  notes: string;
  feeStatus: string;
  feeAmount: string;
  applicationMethod: string;
  trackingReferenceId: string;
  greSubmitted: boolean;
  ieltsSubmitted: boolean;
  toeflSubmitted: boolean;
} & Record<(typeof DOCS)[number][0], boolean>;

const d = (v?: unknown) => (v ? String(v).slice(0, 10) : '');
const blank = (): Form => ({
  universityId: '', programId: '', department: '', programType: '', intakeTerm: '', applicationRound: '', appliedAt: '', deadline: '',
  expectedDecisionDate: '', enrollmentDate: '', status: 'NOT_STARTED', notes: '', feeStatus: '', feeAmount: '', applicationMethod: '',
  trackingReferenceId: '', greSubmitted: false, ieltsSubmitted: false, toeflSubmitted: false,
  officialTranscriptSubmitted: false, lor1Submitted: false, lor2Submitted: false, lor3Submitted: false, sopSubmitted: false, cvSubmitted: false,
});

function Section({ n, icon, title, children, className }: { n: number; icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={`p-6 ${className ?? ''}`}>
      <h3 className="mb-5 flex items-center gap-2 font-semibold text-brand-700 [&>svg]:h-4 [&>svg]:w-4">
        {icon} {n}. {title}
      </h3>
      {children}
    </Card>
  );
}

export function ApplicationFormModal({ open, onClose, onSaved, existing, defaultStatus }: { open: boolean; onClose: () => void; onSaved: () => void; existing?: Application | null; defaultStatus?: AppStatus }) {
  const [f, setF] = useState<Form>(blank());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const unis = useApi<Paged<University>>(open ? '/universities?pageSize=100&sort=rank' : null).data;
  const uni = useApi<University>(open && f.universityId ? `/universities/${f.universityId}` : null).data;
  const profile = useApi<{ greScore?: number; ieltsScore?: number; toeflScore?: number }>(open ? '/profile' : null).data;
  const [scores, setScores] = useState({ greScore: '', ieltsScore: '', toeflScore: '' });

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (existing) {
      const e = existing as Record<string, unknown>;
      setF({
        ...blank(),
        ...Object.fromEntries(Object.keys(blank()).filter((k) => e[k] != null).map((k) => [k, e[k]])),
        universityId: existing.program.university.id,
        programId: existing.program.id,
        appliedAt: d(e.appliedAt), deadline: d(e.deadline), expectedDecisionDate: d(e.expectedDecisionDate), enrollmentDate: d(e.enrollmentDate),
        feeAmount: e.feeAmount != null ? String(e.feeAmount) : '',
      } as Form);
    } else setF({ ...blank(), status: defaultStatus ?? 'NOT_STARTED' });
  }, [open, existing, defaultStatus]);
  useEffect(() => {
    if (profile) setScores({ greScore: profile.greScore?.toString() ?? '', ieltsScore: profile.ieltsScore?.toString() ?? '', toeflScore: profile.toeflScore?.toString() ?? '' });
  }, [profile]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const program = uni?.programs?.find((p) => p.id === f.programId);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const { universityId: _u, programId, feeAmount, ...rest } = f;
    const body: Record<string, unknown> = { ...rest, feeAmount: feeAmount ? Number(feeAmount) : undefined };
    for (const k of ['appliedAt', 'deadline', 'expectedDecisionDate', 'enrollmentDate'] as const) body[k] = f[k] ? new Date(f[k]).toISOString() : undefined;
    for (const [k, v] of Object.entries(body)) if (v === '') delete body[k];
    try {
      if (existing) await api(`/applications/${existing.id}`, { method: 'PATCH', json: body });
      else await api('/applications', { method: 'POST', json: { ...body, programId } });
      const s = { greScore: scores.greScore ? +scores.greScore : undefined, ieltsScore: scores.ieltsScore ? +scores.ieltsScore : undefined, toeflScore: scores.toeflScore ? +scores.toeflScore : undefined };
      if (Object.values(s).some((v) => v != null)) await api('/profile', { method: 'PATCH', json: s }).catch(() => undefined);
      onSaved();
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!existing || !confirm('Delete this application?')) return;
    await api(`/applications/${existing.id}`, { method: 'DELETE' });
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      icon={<FileText />}
      title={existing ? 'Application Details' : 'Add New Application'}
      subtitle="Fill in the details below to add and track your university application"
      footer={
        <>
          {existing && <Button variant="ghost" className="mr-auto text-red-600" onClick={remove}><Trash2 className="h-4 w-4" /> Delete</Button>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!f.programId}><Send className="h-4 w-4" /> {existing ? 'Save Changes' : 'Add Application'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && <ErrorNote error={err.code === 'PLAN_LIMIT' ? { message: `${err.message}` } : err} />}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Section n={1} icon={<Landmark />} title="University & program details">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="University name" required>
                  <Select value={f.universityId} disabled={!!existing} onChange={(e) => setF((x) => ({ ...x, universityId: e.target.value, programId: '' }))}>
                    <option value="">Search and select university</option>
                    {unis?.items.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </Select>
                </Field>
                <Field label="Country"><Input readOnly value={uni?.country ?? ''} placeholder="Auto-filled" /></Field>
                <Field label="Program / subject" required>
                  <Select value={f.programId} disabled={!f.universityId || !!existing} onChange={(e) => set('programId', e.target.value)}>
                    <option value="">Select program or subject</option>
                    {uni?.programs?.map((p) => <option key={p.id} value={p.id}>{p.programName}</option>)}
                  </Select>
                </Field>
                <Field label="Degree level"><Input readOnly value={program?.degreeLevel ?? (existing?.program.degreeLevel ?? '')} placeholder="From program" /></Field>
                <Field label="Department" optional><Input value={f.department} onChange={(e) => set('department', e.target.value)} placeholder="Enter department" /></Field>
                <Field label="Program type">
                  <Select value={f.programType} onChange={(e) => set('programType', e.target.value)}>
                    <option value="">Select program type</option>
                    <option>Thesis</option><option>Non-thesis</option><option>Research</option><option>Coursework</option>
                  </Select>
                </Field>
                <Field label="Intake / term" required><Input value={f.intakeTerm} onChange={(e) => set('intakeTerm', e.target.value)} placeholder="e.g. Fall 2026" /></Field>
                <Field label="Application round">
                  <Select value={f.applicationRound} onChange={(e) => set('applicationRound', e.target.value)}>
                    <option value="">Select round</option>
                    <option>Early</option><option>Round 1</option><option>Round 2</option><option>Rolling</option>
                  </Select>
                </Field>
              </div>
            </Section>
            <Section n={2} icon={<CalendarDays />} title="Important dates">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Application date"><Input type="date" value={f.appliedAt} onChange={(e) => set('appliedAt', e.target.value)} /></Field>
                <Field label="Application deadline" required><Input type="date" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} /></Field>
                <Field label="Expected decision date"><Input type="date" value={f.expectedDecisionDate} onChange={(e) => set('expectedDecisionDate', e.target.value)} /></Field>
                <Field label="Enrollment / start date"><Input type="date" value={f.enrollmentDate} onChange={(e) => set('enrollmentDate', e.target.value)} /></Field>
              </div>
            </Section>
            <Section n={3} icon={<Flag />} title="Application progress">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Current status" required>
                  <Select value={f.status} onChange={(e) => set('status', e.target.value as AppStatus)}>
                    {APP_ORDER.map((s) => <option key={s} value={s}>{APP[s].label}</option>)}
                  </Select>
                </Field>
                <Field label="Progress notes" optional><Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Add any notes about your application progress…" /></Field>
              </div>
              <StepRail
                current={f.status}
                onPick={(k) => set('status', k as AppStatus)}
                steps={APP_ORDER.filter((s) => s !== 'VISA').map((s) => ({ key: s, label: s === 'UNDER_REVIEW' ? 'Under Review' : APP[s].label, color: s === 'ACCEPTED' ? 'border-emerald-500' : s === 'REJECTED' ? 'border-red-400' : undefined }))}
              />
            </Section>
          </div>
          <div className="space-y-6">
            <Section n={4} icon={<FileText />} title="Academic documents">
              <ul className="divide-y divide-line-soft">
                {DOCS.map(([k, label]) => {
                  const c = existing?.checklist?.find((i) => i.key === k);
                  return (
                  <li key={k} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span className="text-sm text-ink">
                      {c?.label ?? label}
                      {c && !c.required && <span className="text-ink-faint"> (optional for this program)</span>}
                    </span>
                    <Toggle2 value={f[k]} onChange={(v) => set(k, v)} />
                  </li>
                  );
                })}
              </ul>
            </Section>
            <Section n={5} icon={<FileText />} title="Test scores">
              <p className="mb-4 text-xs text-ink-mute">Scores are saved to your profile and shared across applications.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ['greScore', 'GRE Score', 'e.g., 320', 'greSubmitted', 'GRE Submitted'],
                    ['ieltsScore', 'IELTS Score (Overall)', 'e.g., 7.5', 'ieltsSubmitted', 'IELTS Submitted'],
                    ['toeflScore', 'TOEFL Score', 'e.g., 100', 'toeflSubmitted', 'TOEFL Submitted'],
                  ] as const
                ).map(([sk, sl, ph, bk, bl]) => (
                  <div key={sk} className="contents">
                    <Field label={sl} optional><Input type="number" step="0.5" placeholder={ph} value={scores[sk]} onChange={(e) => setScores({ ...scores, [sk]: e.target.value })} /></Field>
                    <Field label={bl}><Toggle2 value={f[bk]} onChange={(v) => set(bk, v)} labels={['No', 'Yes']} /></Field>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>
        <Section n={6} icon={<Info />} title="Additional information" className="mx-auto max-w-2xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Application fee status">
              <Select value={f.feeStatus} onChange={(e) => set('feeStatus', e.target.value)}>
                <option value="">Select status</option>
                <option value="PAID">Paid</option><option value="WAIVED">Waived</option><option value="PENDING">Pending</option><option value="NOT_REQUIRED">Not required</option>
              </Select>
            </Field>
            <Field label="Fee amount (USD)" optional><Input type="number" value={f.feeAmount} onChange={(e) => set('feeAmount', e.target.value)} placeholder="e.g., 100" /></Field>
            <Field label="Application method">
              <Select value={f.applicationMethod} onChange={(e) => set('applicationMethod', e.target.value)}>
                <option value="">Select method</option>
                <option>University portal</option><option>Common application</option><option>Email</option><option>Post</option>
              </Select>
            </Field>
            <Field label="Tracking ID / reference" optional><Input value={f.trackingReferenceId} onChange={(e) => set('trackingReferenceId', e.target.value)} placeholder="Enter tracking ID or reference" /></Field>
          </div>
        </Section>
      </div>
    </Modal>
  );
}
