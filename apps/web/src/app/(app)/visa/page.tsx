'use client';

import { AlertTriangle, CalendarClock, Landmark, Lock, Pencil, Plane, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, cx, Empty, ErrorNote, Field, Input, Modal, PageHeader, Spinner, Textarea, Toggle2 } from '@/components/ui';
import { api, ApiError, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';

interface Reminder {
  id: string;
  targetCountry: string;
  i20OrCasReceivedDate: string | null;
  visaAppointmentDate: string | null;
  sevisFeePaid: boolean;
  bankSolvencyExpiryDate: string | null;
  passportExpiryDate: string | null;
  customNotes: string | null;
  notificationEnabled: boolean;
  countdown: { visaAppointment: number | null; bankSolvencyExpiry: number | null; passportExpiry: number | null };
}

const blank = { targetCountry: '', i20OrCasReceivedDate: '', visaAppointmentDate: '', sevisFeePaid: false, bankSolvencyExpiryDate: '', passportExpiryDate: '', customNotes: '', notificationEnabled: true };

function Countdown({ label, days, date }: { label: string; days: number | null; date: string | null }) {
  const tone = days == null ? 'text-ink-faint' : days < 0 ? 'text-ink-faint' : days <= 7 ? 'text-red-600' : days <= 14 ? 'text-amber-600' : 'text-ink';
  return (
    <div className="rounded-xl bg-canvas p-4">
      <p className="text-xs text-ink-mute">{label}</p>
      <p className={cx('mt-1 text-2xl font-semibold', tone)}>{days == null ? '—' : days < 0 ? 'Passed' : `${days}d`}</p>
      <p className="text-xs text-ink-mute">{fmtDate(date)}</p>
    </div>
  );
}

export default function VisaPage() {
  const { data, error, loading, reload } = useApi<Reminder[]>('/visa-reminders');
  const [edit, setEdit] = useState<{ open: boolean; id?: string; f: typeof blank }>({ open: false, f: blank });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);

  if (error?.code === 'PLAN_UPGRADE_REQUIRED' || (error as ApiError | null)?.status === 403) {
    return (
      <div>
        <PageHeader title="Visa reminders" />
        <Empty title="Visa tracking is part of the pro plan" action={<Link href="/purchase-plan"><Button><Lock className="h-4 w-4" /> See plans</Button></Link>}>
          Log your I-20/CAS, visa appointment and bank-solvency dates and get reminders 14, 7 and 1 day before each.
        </Empty>
      </div>
    );
  }

  const open = (r?: Reminder) =>
    setEdit({
      open: true,
      id: r?.id,
      f: r
        ? { targetCountry: r.targetCountry, i20OrCasReceivedDate: r.i20OrCasReceivedDate?.slice(0, 10) ?? '', visaAppointmentDate: r.visaAppointmentDate?.slice(0, 10) ?? '', sevisFeePaid: r.sevisFeePaid, bankSolvencyExpiryDate: r.bankSolvencyExpiryDate?.slice(0, 10) ?? '', passportExpiryDate: r.passportExpiryDate?.slice(0, 10) ?? '', customNotes: r.customNotes ?? '', notificationEnabled: r.notificationEnabled }
        : blank,
    });
  const save = async () => {
    setBusy(true);
    setErr(null);
    const body: Record<string, unknown> = { ...edit.f };
    for (const k of ['i20OrCasReceivedDate', 'visaAppointmentDate', 'bankSolvencyExpiryDate', 'passportExpiryDate']) body[k] = body[k] ? new Date(body[k] as string).toISOString() : undefined;
    if (!body.customNotes) delete body.customNotes;
    try {
      await api(edit.id ? `/visa-reminders/${edit.id}` : '/visa-reminders', { method: edit.id ? 'PATCH' : 'POST', json: body });
      setEdit({ open: false, f: blank });
      reload();
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    if (!confirm('Delete this visa timeline?')) return;
    await api(`/visa-reminders/${id}`, { method: 'DELETE' });
    reload();
  };
  const f = edit.f;
  const setF = (k: keyof typeof blank, v: unknown) => setEdit((e) => ({ ...e, f: { ...e.f, [k]: v } }));

  return (
    <div>
      <PageHeader title="Visa reminders" subtitle="Your own visa timeline with countdowns and alerts at 14, 7 and 1 day." actions={<Button onClick={() => open()} data-tour="visa-add"><Plus className="h-4 w-4" /> Add timeline</Button>} />
      <div className="mb-6 flex items-start gap-3 rounded-2xl bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        These are reminders for dates you enter. HigherStudy doesn't process visas or give immigration advice — always confirm requirements with the embassy or consulate.
      </div>
      <ErrorNote error={error} />
      {loading && !data ? <Spinner /> : !data?.length ? (
        <div data-tour="visa-list"><Empty title="No visa timeline yet" action={<Button onClick={() => open()}><Plus className="h-4 w-4" /> Add your first timeline</Button>}>Add the country and key dates once you have an offer.</Empty></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2" data-tour="visa-list">
          {data.map((r) => (
            <Card key={r.id} className="p-6">
              <div className="mb-5 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-50 text-cyan-600"><Plane className="h-5 w-5" /></span>
                  <div>
                    <p className="text-lg font-semibold">{r.targetCountry}</p>
                    <p className="text-sm text-ink-mute">{r.notificationEnabled ? 'Alerts on' : 'Alerts off'}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="rounded-lg p-2 text-ink-faint hover:bg-slate-100" onClick={() => open(r)} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                  <button className="rounded-lg p-2 text-ink-faint hover:bg-red-50 hover:text-red-600" onClick={() => remove(r.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Countdown label="Visa appointment" days={r.countdown.visaAppointment} date={r.visaAppointmentDate} />
                <Countdown label="Bank solvency expires" days={r.countdown.bankSolvencyExpiry} date={r.bankSolvencyExpiryDate} />
                <Countdown label="Passport expires" days={r.countdown.passportExpiry} date={r.passportExpiryDate} />
              </div>
              <ul className="mt-5 space-y-2 text-sm">
                <li className="flex justify-between"><span className="flex items-center gap-2 text-ink-mute"><CalendarClock className="h-4 w-4" /> I-20 / CAS received</span>{fmtDate(r.i20OrCasReceivedDate)}</li>
                <li className="flex justify-between"><span className="flex items-center gap-2 text-ink-mute"><Landmark className="h-4 w-4" /> SEVIS fee</span><Badge tone={r.sevisFeePaid ? 'green' : 'amber'}>{r.sevisFeePaid ? 'Paid' : 'Not paid'}</Badge></li>
              </ul>
              {r.customNotes && <p className="mt-4 rounded-lg bg-canvas px-4 py-3 text-sm text-ink-soft">{r.customNotes}</p>}
            </Card>
          ))}
        </div>
      )}

      <Modal open={edit.open} onClose={() => setEdit({ open: false, f: blank })} title={edit.id ? 'Edit visa timeline' : 'Add visa timeline'} icon={<Plane />}
        footer={<><Button variant="ghost" onClick={() => setEdit({ open: false, f: blank })}>Cancel</Button><Button onClick={save} loading={busy} disabled={!f.targetCountry}>Save</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><ErrorNote error={err} /></div>
          <Field label="Target country" required><Input value={f.targetCountry} onChange={(e) => setF('targetCountry', e.target.value)} placeholder="United States" /></Field>
          <Field label="I-20 / CAS received"><Input type="date" value={f.i20OrCasReceivedDate} onChange={(e) => setF('i20OrCasReceivedDate', e.target.value)} /></Field>
          <Field label="Visa appointment"><Input type="date" value={f.visaAppointmentDate} onChange={(e) => setF('visaAppointmentDate', e.target.value)} /></Field>
          <Field label="Bank solvency expiry"><Input type="date" value={f.bankSolvencyExpiryDate} onChange={(e) => setF('bankSolvencyExpiryDate', e.target.value)} /></Field>
          <Field label="Passport expiry"><Input type="date" value={f.passportExpiryDate} onChange={(e) => setF('passportExpiryDate', e.target.value)} /></Field>
          <Field label="SEVIS fee paid"><Toggle2 value={f.sevisFeePaid} onChange={(v) => setF('sevisFeePaid', v)} labels={['No', 'Yes']} /></Field>
          <div className="sm:col-span-2"><Field label="Notes" optional><Textarea value={f.customNotes} onChange={(e) => setF('customNotes', e.target.value)} placeholder="e.g. Bring DS-160 confirmation" /></Field></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.notificationEnabled} onChange={(e) => setF('notificationEnabled', e.target.checked)} /> Email and in-app reminders</label>
        </div>
      </Modal>
    </div>
  );
}
