'use client';

import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Download, FileSpreadsheet, GraduationCap, Landmark, RotateCcw, Upload, XCircle } from 'lucide-react';
import Link from 'next/link';
import { DragEvent, ReactNode, useRef, useState } from 'react';
import { Badge, Button, Card, cx, ErrorNote, PageHeader, Pagination, Spinner } from '@/components/ui';
import { api, apiDownload, ApiError, useApi } from '@/lib/api';
import { fmtDate, fmtTime } from '@/lib/format';
import type { Paged } from '@/lib/types';

type Entity = 'universities' | 'programs' | 'professors';
type Action = 'create' | 'update' | 'unchanged' | 'error';

interface PreviewRow {
  line: number;
  action: Action;
  id: string | null;
  label: string;
  errors: string[];
  warnings: string[];
  changes: [string, unknown, unknown][];
}
interface Preview {
  importId: string;
  entity: Entity;
  fileName: string;
  expiresAt: string;
  fileWarnings: string[];
  summary: { total: number; create: number; update: number; unchanged: number; error: number; warnings: number };
  rows: PreviewRow[];
}
interface Job {
  id: string;
  entity: Entity;
  fileName: string;
  status: 'COMMITTED' | 'FAILED';
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  createdAt: string;
  performedBy: { email: string; role: string };
}

const ENTITIES: { key: Entity; label: string; icon: ReactNode; blurb: string; columns: string; order: string }[] = [
  { key: 'universities', label: 'Universities', icon: <Landmark />, blurb: 'Name, location and CS rank. Rank number and state are read from the text.', columns: 'name, location · optional: id, cs_rank, wes_required', order: 'Import first' },
  { key: 'programs', label: 'Programs', icon: <GraduationCap />, blurb: 'Deadlines, fees, GRE/IELTS and funding, written as the university publishes them.', columns: 'university_id, program_name, degree_level · optional: id, fees, requirements…', order: 'Needs universities' },
  { key: 'professors', label: 'Professors', icon: <Building2 />, blurb: 'Faculty with email, links, metrics and research areas (separate areas with ";").', columns: 'university_id, name · optional: id, email, links, h_index, research_areas…', order: 'Needs universities' },
];

const ACTION: Record<Action, { label: string; tone: 'green' | 'blue' | 'gray' | 'red' }> = {
  create: { label: 'New', tone: 'green' },
  update: { label: 'Update', tone: 'blue' },
  unchanged: { label: 'No change', tone: 'gray' },
  error: { label: 'Error', tone: 'red' },
};

const show = (v: unknown) => (v == null || v === '' ? '∅' : Array.isArray(v) ? v.join('; ') : String(v));

export default function ImportsPage() {
  const [entity, setEntity] = useState<Entity>('universities');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [filter, setFilter] = useState<Action | 'all' | 'warn'>('all');
  const [allowPartial, setAllowPartial] = useState(false);
  const [busy, setBusy] = useState<'check' | 'commit' | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [done, setDone] = useState<{ created: number; updated: number; unchanged: number; skipped: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const [page, setPage] = useState(1);
  const input = useRef<HTMLInputElement>(null);
  const history = useApi<Paged<Job>>(`/admin/imports?page=${page}`);

  const reset = () => (setFile(null), setPreview(null), setErr(null), setDone(null), setAllowPartial(false), setFilter('all'));
  const pick = (f: File | undefined) => {
    if (!f) return;
    reset();
    if (f.size > 2 * 1024 * 1024) return setErr(new ApiError(413, 'That file is over 2 MB. Split it into smaller files.'));
    setFile(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files[0]);
  };

  const check = async () => {
    if (!file) return;
    setBusy('check');
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      setPreview(await api<Preview>(`/admin/imports/${entity}/preview`, { method: 'POST', body: fd }));
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(null);
    }
  };
  const commit = async () => {
    if (!preview) return;
    setBusy('commit');
    setErr(null);
    try {
      const r = await api<{ created: number; updated: number; unchanged: number; skipped: number }>(`/admin/imports/${preview.importId}/commit`, { method: 'POST', json: { allowPartial } });
      setDone(r);
      setPreview(null);
      history.reload();
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(null);
    }
  };

  const s = preview?.summary;
  const toWrite = s ? s.create + s.update : 0;
  const rows = preview?.rows.filter((r) => (filter === 'all' ? true : filter === 'warn' ? r.warnings.length > 0 : r.action === filter)) ?? [];
  const blocked = !!s && s.error > 0 && !allowPartial;

  return (
    <div className="space-y-6">
      <PageHeader title="CSV import" subtitle="Add or update the directory in bulk. every file is checked first — nothing is written until you confirm." />

      {/* 1 — what */}
      <div className="grid gap-4 md:grid-cols-3">
        {ENTITIES.map((e) => (
          <button key={e.key} onClick={() => (setEntity(e.key), reset())} className="text-left">
            <Card className={cx('h-full p-5 transition', entity === e.key ? 'border-brand-400 ring-2 ring-brand-100' : 'hover:border-brand-200')}>
              <div className="flex items-start justify-between">
                <span className={cx('grid h-10 w-10 place-items-center rounded-xl [&>svg]:h-5 [&>svg]:w-5', entity === e.key ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600')}>{e.icon}</span>
                <Badge tone={e.key === 'universities' ? 'indigo' : 'gray'}>{e.order}</Badge>
              </div>
              <p className="mt-3 font-semibold">{e.label}</p>
              <p className="mt-1 text-sm text-ink-mute">{e.blurb}</p>
              <p className="mt-3 font-mono text-[11px] leading-relaxed text-ink-faint">{e.columns}</p>
            </Card>
          </button>
        ))}
      </div>

      {/* 2 — upload */}
      {!preview && !done && (
        <Card className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Upload {entity} CSV</h2>
              <p className="text-sm text-ink-mute">Rows are matched by <code>id</code>, or by {entity === 'universities' ? 'name' : entity === 'programs' ? 'university + program name + degree' : 'university + email (or name)'} when id is empty. Matches are updated, the rest are added.</p>
            </div>
            <Button variant="ghost" onClick={() => apiDownload(`/admin/imports/templates/${entity}`, `${entity}-template.csv`).catch((e) => setErr(e))}>
              <Download className="h-4 w-4" /> Download template
            </Button>
          </div>
          <div
            onDragOver={(e) => (e.preventDefault(), setDrag(true))}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => input.current?.click()}
            className={cx('flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition', drag ? 'border-brand-400 bg-brand-50' : 'border-line hover:border-brand-300 hover:bg-canvas')}
          >
            <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            {file ? (
              <>
                <FileSpreadsheet className="h-10 w-10 text-brand-600" />
                <p className="mt-3 font-medium">{file.name}</p>
                <p className="text-sm text-ink-mute">{(file.size / 1024).toFixed(1)} KB · click to choose another file</p>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 text-ink-faint" />
                <p className="mt-3 font-medium">Drop a .csv file here, or click to browse</p>
                <p className="text-sm text-ink-mute">UTF-8 · up to 2 MB · 5,000 rows. From Excel or Google Sheets: File → Download / Save as → CSV.</p>
              </>
            )}
          </div>
          <div className="mt-4"><ErrorNote error={err} /></div>
          <div className="mt-4 flex justify-end gap-3">
            {file && <Button variant="ghost" onClick={reset}>Clear</Button>}
            <Button onClick={check} disabled={!file} loading={busy === 'check'}>Check file <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </Card>
      )}

      {/* 3 — preview */}
      {preview && s && (
        <Card className="overflow-hidden">
          <div className="border-b border-line p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">Review {preview.fileName}</h2>
                <p className="text-sm text-ink-mute">{s.total} rows checked · nothing has been written yet · preview valid until {fmtTime(preview.expiresAt)}</p>
              </div>
              <Button variant="ghost" onClick={reset}><RotateCcw className="h-4 w-4" /> Start over</Button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(
                [
                  ['all', 'All rows', s.total, 'text-ink'],
                  ['create', 'New', s.create, 'text-emerald-600'],
                  ['update', 'Updates', s.update, 'text-blue-600'],
                  ['unchanged', 'No change', s.unchanged, 'text-ink-mute'],
                  ['error', 'Errors', s.error, s.error ? 'text-red-600' : 'text-ink-mute'],
                ] as const
              ).map(([k, label, n, cls]) => (
                <button key={k} onClick={() => setFilter(k)} className={cx('rounded-xl border p-3 text-left transition', filter === k ? 'border-brand-400 bg-brand-50' : 'border-line hover:bg-canvas')}>
                  <p className="text-xs text-ink-mute">{label}</p>
                  <p className={cx('text-2xl font-semibold', cls)}>{n}</p>
                </button>
              ))}
            </div>
            {s.warnings > 0 && (
              <button onClick={() => setFilter('warn')} className="mt-3 inline-flex items-center gap-1.5 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4" /> {s.warnings} row{s.warnings > 1 ? 's' : ''} with warnings (imported, but worth a look)
              </button>
            )}
            {preview.fileWarnings.map((w) => <p key={w} className="mt-2 text-sm text-amber-700">{w}</p>)}
          </div>

          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-brand-25 text-left text-[13px] font-medium text-ink-mute">
                <tr><th className="w-16 px-6 py-3">Line</th><th className="px-4 py-3">Record</th><th className="w-28 px-4 py-3">Result</th><th className="px-4 py-3">Details</th></tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.line} className={r.action === 'error' ? 'bg-red-50/40' : ''}>
                    <td className="px-6 py-3 font-mono text-xs text-ink-mute">{r.line}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.label || '—'}</p>
                      {r.id && <p className="font-mono text-[11px] text-ink-faint">{r.id}</p>}
                    </td>
                    <td className="px-4 py-3"><Badge tone={ACTION[r.action].tone}>{ACTION[r.action].label}</Badge></td>
                    <td className="px-4 py-3">
                      <ul className="space-y-1">
                        {r.errors.map((e) => <li key={e} className="flex gap-1.5 text-red-700"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{e}</li>)}
                        {r.changes.map(([f, a, b]) => (
                          <li key={f} className="text-ink-soft">
                            <span className="font-medium text-ink">{f}</span>: <span className="text-ink-faint line-through">{show(a)}</span> → <span>{show(b)}</span>
                          </li>
                        ))}
                        {r.warnings.map((w) => <li key={w} className="flex gap-1.5 text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</li>)}
                        {!r.errors.length && !r.changes.length && !r.warnings.length && <li className="text-ink-faint">{r.action === 'create' ? 'All fields valid' : 'Matches the current record'}</li>}
                      </ul>
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={4} className="px-6 py-10 text-center text-ink-mute">No rows in this view.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line p-6">
            <div className="text-sm">
              {s.error > 0 ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={allowPartial} onChange={(e) => setAllowPartial(e.target.checked)} />
                  Import the {toWrite} valid row{toWrite === 1 ? '' : 's'} and skip {s.error} with errors
                </label>
              ) : (
                <span className="text-ink-mute">All rows are valid.</span>
              )}
              <div className="mt-2"><ErrorNote error={err} /></div>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              <Button onClick={commit} loading={busy === 'commit'} disabled={blocked || toWrite === 0}>
                {toWrite === 0 ? 'Nothing to import' : `Import ${toWrite} row${toWrite === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 4 — done */}
      {done && (
        <Card className="flex flex-wrap items-center gap-5 p-6">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <div className="flex-1">
            <p className="font-semibold">Import complete</p>
            <p className="text-sm text-ink-mute">
              {done.created} added · {done.updated} updated · {done.unchanged} unchanged{done.skipped ? ` · ${done.skipped} skipped` : ''}. Students see the changes now.
            </p>
          </div>
          <Link href="/admin/directory"><Button variant="ghost">Open directory</Button></Link>
          <Button onClick={reset}>Import another file</Button>
        </Card>
      )}

      {/* history */}
      <Card className="overflow-hidden">
        <h2 className="px-6 pt-6 font-semibold">Import history</h2>
        {history.loading && !history.data ? <Spinner /> : (
          <table className="mt-4 w-full text-sm">
            <thead className="bg-brand-25 text-left text-[13px] font-medium text-ink-mute">
              <tr><th className="px-6 py-3">When</th><th className="px-4 py-3">File</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">By</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {history.data?.items.map((j) => (
                <tr key={j.id}>
                  <td className="px-6 py-3 whitespace-nowrap">{fmtDate(j.createdAt)} <span className="text-ink-mute">{fmtTime(j.createdAt)}</span></td>
                  <td className="max-w-[220px] truncate px-4 py-3 font-medium" title={j.fileName}>{j.fileName}</td>
                  <td className="px-4 py-3 capitalize">{j.entity}</td>
                  <td className="px-4 py-3 text-ink-soft">{j.performedBy.email}</td>
                  <td className="px-4 py-3 text-ink-soft">{j.status === 'COMMITTED' ? `+${j.created} · ~${j.updated} · ${j.unchanged} same${j.skipped ? ` · ${j.skipped} skipped` : ''}` : `${j.totalRows} rows, none written`}</td>
                  <td className="px-4 py-3"><Badge tone={j.status === 'COMMITTED' ? 'green' : 'red'}>{j.status === 'COMMITTED' ? 'Imported' : 'Failed'}</Badge></td>
                </tr>
              ))}
              {!history.data?.items.length && <tr><td colSpan={6} className="px-6 py-10 text-center text-ink-mute">No imports yet.</td></tr>}
            </tbody>
          </table>
        )}
        {history.data && history.data.total > history.data.pageSize && (
          <div className="border-t border-line px-5"><Pagination page={history.data.page} pageSize={history.data.pageSize} total={history.data.total} onPage={setPage} noun="imports" /></div>
        )}
      </Card>
    </div>
  );
}
