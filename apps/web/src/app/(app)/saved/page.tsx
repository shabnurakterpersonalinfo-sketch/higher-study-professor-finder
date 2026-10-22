'use client';

import { Heart, Landmark, MapPin, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Avatar, Badge, Button, Card, cx, Empty, ErrorNote, PageHeader, Segmented, Spinner, Tag } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import type { Program, University } from '@/lib/types';

interface Saved {
  universities: University[];
  professors: { id: string; name: string; title?: string | null; photoUrl?: string | null; researchAreas: string[]; acceptingStudents: boolean; university: { name: string } }[];
  programs: (Program & { university: { name: string } })[];
}

export default function SavedPage() {
  const { data, error, loading, reload } = useApi<Saved>('/saved');
  const [tab, setTab] = useState<'universities' | 'professors'>('universities');
  const unsave = async (type: string, id: string) => {
    await api(`/saved/${type}/${id}`, { method: 'DELETE' });
    reload();
  };

  return (
    <div>
      <PageHeader title="Saved items" subtitle="Universities and professors you’ve bookmarked." />
      <div data-tour="saved-tabs" className="mb-6 w-fit">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'universities', label: 'Universities', count: data?.universities.length },
            { value: 'professors', label: 'Professors', count: data?.professors.length },
          ]}
        />
      </div>
      <ErrorNote error={error} />
      {loading && !data ? <Spinner /> : data && tab === 'universities' ? (
        !data.universities.length ? <Empty title="No saved universities" action={<Link href="/universities"><Button>Find universities</Button></Link>} /> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.universities.map((u) => (
              <Card key={u.id} className="p-5">
                <div className="flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><Landmark className="h-5 w-5" /></span>
                  <button onClick={() => unsave('UNIVERSITY', u.id)} aria-label="Remove"><Heart className="h-5 w-5 fill-red-500 text-red-500" /></button>
                </div>
                <p className="mt-3 font-semibold">{u.name}</p>
                <p className="flex items-center gap-1 text-sm text-ink-mute"><MapPin className="h-3.5 w-3.5" /> {u.location}, {u.country}</p>
                {u.csRank && <Badge tone="violet" className="mt-2">{u.csRank}</Badge>}
                <Link href={`/universities/${u.id}`}><Button variant="secondary" className="mt-4 w-full">View professors</Button></Link>
              </Card>
            ))}
          </div>
        )
      ) : data && (
        !data.professors.length ? <Empty title="No saved professors" action={<Link href="/professors"><Button>Find professors</Button></Link>} /> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.professors.map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex items-start gap-3">
                  <Avatar name={p.name} src={p.photoUrl} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Prof. {p.name}</p>
                    <p className="truncate text-sm text-ink-mute">{p.university.name}</p>
                  </div>
                  <button onClick={() => unsave('PROFESSOR', p.id)} className="text-ink-faint hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">{p.researchAreas.slice(0, 3).map((a) => <Tag key={a}>{a}</Tag>)}</div>
                <Link href={`/professors/${p.id}`}><Button variant="secondary" className="mt-4 w-full">View profile</Button></Link>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}
