'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ProfessorBrowser } from '@/components/professor-browser';
import { PageHeader, Spinner } from '@/components/ui';

function Inner() {
  const q = useSearchParams().get('q') ?? '';
  return (
    <>
      <PageHeader title="Professors" subtitle="Search faculty across every university by name, research area or keyword." />
      <ProfessorBrowser initialQuery={q} />
    </>
  );
}

export default function ProfessorsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Inner />
    </Suspense>
  );
}
