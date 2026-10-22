'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthFrame } from '@/components/auth-frame';
import { Button, ErrorNote, Field, Input, Select } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function RegisterPage() {
  const { register } = useAuth();
  const [f, setF] = useState({ fullName: '', email: '', password: '', targetDegree: 'MS' });
  const [error, setError] = useState<{ message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(f.fullName, f.email, f.password, f.targetDegree);
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame title="Create your account" subtitle="Free to start. next, a two-minute profile setup so we can match you with programs.">
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote error={error} />
        <Field label="Full name">
          <Input required value={f.fullName} onChange={set('fullName')} />
        </Field>
        <Field label="Email">
          <Input type="email" required value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input type="password" minLength={8} required value={f.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <Field label="I'm aiming for">
          <Select value={f.targetDegree} onChange={set('targetDegree')}>
            <option value="MS">Master's</option>
            <option value="PhD">PhD</option>
            <option value="PostDoc">PostDoc</option>
          </Select>
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-mute">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand-600">
          Log in
        </Link>
      </p>
    </AuthFrame>
  );
}
