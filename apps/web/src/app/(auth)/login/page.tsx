'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthFrame } from '@/components/auth-frame';
import { Button, ErrorNote, Field, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      const e = err as ApiError;
      // The per-network limit (no code) reads as a bare "Too Many Requests"; say what to do instead.
      setError(e.status === 429 && !e.code ? { message: 'Too many attempts from this network. Wait a minute and try again.' } : e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Welcome back" subtitle="Log in to continue your applications.">
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote error={error} />
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Log in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-mute">
        New to HigherStudy?{' '}
        <Link href="/register" className="font-medium text-brand-600">
          Create an account
        </Link>
      </p>
    </AuthFrame>
  );
}
