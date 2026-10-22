'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { me, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading) router.replace(!me ? '/login' : me.role === 'GU' ? '/dashboard' : '/admin');
  }, [me, loading, router]);
  return <Spinner />;
}
