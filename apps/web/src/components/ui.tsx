'use client';

import clsx from 'clsx';
import { CheckCircle2, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import { ButtonHTMLAttributes, createContext, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useCallback, useContext, useEffect, useState } from 'react';
import { initials, TONES, Tone } from '@/lib/format';

export const cx = clsx;

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-card border border-line-soft bg-white shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        {icon && <span className="text-brand-600">{icon}</span>}
        {children}
      </h2>
      {action}
    </div>
  );
}

/** `inverse` / `inverseGhost` are for buttons on the dark indigo (#1E1B4B) surfaces. */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'inverse' | 'inverseGhost';
export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-55',
        size === 'sm' && 'h-8 rounded-lg px-3 text-[13px]',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-[15px]',
        variant === 'primary' && 'bg-brand-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] hover:bg-brand-700',
        variant === 'secondary' && 'bg-brand-50 text-brand-700 hover:bg-brand-100',
        variant === 'outline' && 'border border-brand-200 bg-white text-brand-700 hover:border-brand-300 hover:bg-brand-25',
        variant === 'ghost' && 'border border-line bg-white text-ink-soft hover:border-slate-300 hover:text-ink',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        variant === 'inverse' && 'bg-white font-semibold text-[#1E1B4B] hover:bg-brand-50',
        variant === 'inverseGhost' && 'border border-white/30 text-white hover:bg-white/10',
        className,
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>{children}</span>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-[13px] font-medium text-brand-700">{children}</span>;
}

export function Field({ label, hint, required, optional, children, error }: { label: string; hint?: string; required?: boolean; optional?: boolean; children: ReactNode; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
        {required && <span className="text-red-500"> *</span>}
        {optional && <span className="font-normal text-ink-faint"> · optional</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const inputCls =
  'rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-slate-300 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100';
/** Full width unless the caller sets its own width (avoids w-full vs w-44 CSS-order clashes). */
const widthOf = (c?: string) => (c && /(^|\s)(w-|min-w-|flex-)/.test(c) ? '' : 'w-full');
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, widthOf(p.className), p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx(inputCls, widthOf(p.className), p.className)} />;
export const Select = ({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cx(inputCls, widthOf(p.className), 'appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%236B7280%27 stroke-width=%272%27%3E%3Cpath d=%27M4 6l4 4 4-4%27/%3E%3C/svg%3E")] bg-[right_12px_center] bg-no-repeat pr-9', p.className)}>
    {children}
  </select>
);

/** Two-option segmented radio used for "Submitted / Not Submitted" and "Yes / No". */
export function Toggle2({ value, onChange, labels = ['Not Submitted', 'Submitted'] }: { value: boolean; onChange: (v: boolean) => void; labels?: [string, string] }) {
  return (
    <div className="inline-flex rounded-xl bg-canvas p-1">
      {[false, true].map((v, i) => (
        <button
          type="button"
          key={String(v)}
          onClick={() => onChange(v)}
          className={cx(
            'flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition',
            value === v ? (v ? 'bg-white text-emerald-700 shadow-card' : 'bg-white text-ink shadow-card') : 'text-ink-mute hover:text-ink',
          )}
        >
          <span className={cx('grid h-4 w-4 place-items-center rounded-full border', value === v ? (v ? 'border-emerald-600' : 'border-brand-600') : 'border-slate-300')}>
            {value === v && <span className={cx('h-2 w-2 rounded-full', v ? 'bg-emerald-600' : 'bg-brand-600')} />}
          </span>
          {labels[i]}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name)}
    </span>
  );
}

export function StatCard({ label, value, sub, icon, tone = 'indigo' }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: Tone }) {
  return (
    <Card className="flex items-start gap-3.5 p-5">
      {icon && <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-2xl ring-0', TONES[tone])}>{icon}</span>}
      <div className="min-w-0">
        <p className="text-[13px] text-ink-mute">{label}</p>
        <p className="mt-1 text-[26px] font-semibold leading-tight tracking-tight text-ink tabular-nums">{value}</p>
        {sub && <p className="mt-1 text-xs text-ink-mute">{sub}</p>}
      </div>
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-ink-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage, noun = 'entries' }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const nums = Array.from(new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))).sort((a, b) => a - b);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm text-ink-mute">
      <span>
        Showing {from} to {to} of {total.toLocaleString()} {noun}
      </span>
      <div className="flex items-center gap-1">
        <button className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white text-ink-soft hover:text-ink disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {nums.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - nums[i - 1] > 1 && <span className="px-1">…</span>}
            <button onClick={() => onPage(n)} className={cx('h-9 min-w-9 rounded-xl px-2 text-sm tabular-nums', n === page ? 'bg-ink font-medium text-white' : 'hover:bg-white')}>
              {n}
            </button>
          </span>
        ))}
        <button className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white text-ink-soft hover:text-ink disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, icon, children, footer, wide }: { open: boolean; onClose: () => void; title: string; subtitle?: string; icon?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1C1F3A]/35 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className={cx('my-8 w-full animate-fade-up rounded-3xl bg-white shadow-pop', wide ? 'max-w-5xl' : 'max-w-lg')} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-start gap-4 px-6 pb-2 pt-6">
          {icon && <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</span>}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-ink">{title}</h3>
            {subtitle && <p className="text-sm text-ink-mute">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink-faint hover:bg-canvas hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-3 rounded-b-3xl border-t border-line-soft bg-brand-25 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-white/60 px-6 py-14 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-500 [&>svg]:h-5 [&>svg]:w-5">{icon ?? <Inbox />}</span>
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-ink-mute">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx('relative overflow-hidden rounded-xl bg-[#ECEDF4]', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

/**
 * Loading state. Pages show a skeleton of a page (title + cards) instead of a
 * spinner so the layout doesn't jump; `inline` is a small spinner for menus.
 */
export function Spinner({ inline }: { inline?: boolean }) {
  if (inline) {
    return (
      <div className="grid place-items-center py-8 text-brand-500" role="status" aria-label="Loading">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  return (
    <div className="space-y-6 py-2" role="status" aria-label="Loading">
      <div className="space-y-2.5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-card" />)}
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}

/** Pill-style tabs: one value of a small set ("All / New / Updates"). */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={cx('inline-flex flex-wrap gap-1 rounded-2xl bg-white p-1 ring-1 ring-line-soft', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm transition-colors',
            value === o.value ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-mute hover:text-ink',
          )}
        >
          {o.label}
          {o.count != null && <span className={cx('rounded-full px-1.5 text-xs tabular-nums', value === o.value ? 'bg-white text-brand-700' : 'bg-canvas text-ink-mute')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- toasts
type ToastMsg = { id: number; text: string; tone: 'success' | 'error' };
const ToastCtx = createContext<(text: string, tone?: ToastMsg['tone']) => void>(() => {});

/** Small confirmation that slides in at the bottom; replaces silent saves. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, tone: ToastMsg['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto flex animate-fade-up items-center gap-2.5 rounded-2xl px-4 py-3 text-sm shadow-pop', t.tone === 'success' ? 'bg-night text-white' : 'bg-red-600 text-white')}>
            {t.tone === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <X className="h-4 w-4" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function ErrorNote({ error }: { error: { message: string; code?: string } | null }) {
  if (!error) return null;
  return <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error.message}</div>;
}

/** Horizontal rail of status dots used on the application form (Not Started → Rejected). */
export function StepRail({ steps, current, onPick }: { steps: { key: string; label: string; color?: string }[]; current: string; onPick?: (k: string) => void }) {
  const idx = steps.findIndex((s) => s.key === current);
  return (
    <div className="relative mt-6 flex justify-between">
      <div className="absolute left-4 right-4 top-[9px] h-px bg-line" />
      {steps.map((s, i) => (
        <button type="button" key={s.key} onClick={() => onPick?.(s.key)} className="relative z-10 flex w-16 flex-col items-center gap-1.5">
          <span
            className={cx(
              'grid h-[18px] w-[18px] place-items-center rounded-full border-2 bg-white',
              i === idx ? 'scale-125 border-brand-600' : i < idx ? 'border-brand-400' : s.color ?? 'border-slate-300',
            )}
          >
            {i <= idx && <span className={cx('h-2 w-2 rounded-full', i === idx ? 'bg-brand-600' : 'bg-brand-300')} />}
          </span>
          <span className={cx('text-[11px] leading-tight', i === idx ? 'font-medium text-ink' : 'text-ink-faint')}>{s.label}</span>
        </button>
      ))}
    </div>
  );
}
