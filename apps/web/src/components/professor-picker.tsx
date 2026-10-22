'use client';

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Paged, ProfessorRow } from '@/lib/types';
import { Avatar, cx, Input } from './ui';

/** Debounced typeahead over POST /professors/search. */
export function ProfessorPicker({ value, onChange }: { value: ProfessorRow | null; onChange: (p: ProfessorRow | null) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ProfessorRow[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setItems([]);
    const t = setTimeout(() => {
      api<Paged<ProfessorRow>>('/professors/search', { method: 'POST', json: { q, pageSize: 6 } })
        .then((r) => setItems(r.items))
        .catch(() => setItems([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value)
    return (
      <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5">
        <Avatar name={value.name} src={value.photoUrl} size={36} />
        <div className="flex-1">
          <p className="text-sm font-medium">Prof. {value.name}</p>
          <p className="text-xs text-ink-mute">{value.universityName}</p>
        </div>
        <button type="button" className="text-xs font-medium text-brand-700" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" />
      <Input className="pl-9" placeholder="Search by name or research area…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {!!items.length && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-pop">
          {items.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onChange(p)} className={cx('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-canvas')}>
                <Avatar name={p.name} src={p.photoUrl} size={32} />
                <span className="flex-1">
                  <span className="block text-sm font-medium">Prof. {p.name}</span>
                  <span className="block text-xs text-ink-mute">{p.universityName} · {p.researchAreas.slice(0, 2).join(', ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
