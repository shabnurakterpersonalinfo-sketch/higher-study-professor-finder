'use client';

import { Check, X } from 'lucide-react';
import { cx } from './ui';

export function MatchRing({ score, size = 24 }: { score: number; size?: number }) {
  const c = 2 * Math.PI * 9;
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#94A3B8';
  return (
    <span className="inline-flex items-center gap-2 text-xl font-semibold">
      {score}%
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="9" fill="none" stroke="#E5E7EB" strokeWidth="3" />
        <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 12 12)" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Up to `n` reasons, positives first — the match score explains itself. */
export function MatchReasons({ reasons, n = 3 }: { reasons: { ok: boolean; text: string }[]; n?: number }) {
  return (
    <ul className="space-y-1 text-[13px]">
      {[...reasons].sort((a, b) => Number(b.ok) - Number(a.ok)).slice(0, n).map((r) => (
        <li key={r.text} className={cx('flex items-start gap-1.5', r.ok ? 'text-emerald-700' : 'text-ink-mute')}>
          {r.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          {r.text}
        </li>
      ))}
    </ul>
  );
}

