'use client';

import { KeyRound, Laptop, Smartphone } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { api, ApiError, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate } from '@/lib/format';
import { Badge, Button, Card, cx, ErrorNote, Field, Input, Spinner, useToast } from './ui';

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

/** "Chrome on Windows" from a user-agent string; good enough to recognise your own devices. */
function describe(ua: string | null) {
  if (!ua) return { label: 'Unknown device', mobile: false };
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|python/i.test(ua) ? 'Script' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return { label: os ? `${browser} on ${os}` : browser, mobile: /Android|iPhone|iPad|Mobile/.test(ua) };
}

const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  if (m < 2) return 'Active now';
  if (m < 60) return `Active ${m} minutes ago`;
  if (m < 1440) return `Active ${Math.round(m / 60)} hours ago`;
  return `Active ${fmtDate(d)}`;
};

export function SecuritySettings() {
  const { logout } = useAuth();
  const toast = useToast();
  const { data: sessions, reload } = useApi<SessionRow[]>('/auth/sessions');
  const [busy, setBusy] = useState<string | null>(null);
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [err, setErr] = useState<ApiError | { message: string } | null>(null);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (f.newPassword.length < 8) return setErr({ message: 'Use at least 8 characters for the new password.' });
    if (f.newPassword !== f.confirm) return setErr({ message: 'The two new passwords don’t match.' });
    setBusy('password');
    try {
      const r = await api<{ otherSessionsSignedOut: number }>('/auth/password', { method: 'POST', json: { currentPassword: f.currentPassword, newPassword: f.newPassword } });
      setF({ currentPassword: '', newPassword: '', confirm: '' });
      toast(r.otherSessionsSignedOut ? `Password changed. ${r.otherSessionsSignedOut} other device(s) signed out.` : 'Password changed');
      reload();
    } catch (x) {
      setErr(x as ApiError);
    } finally {
      setBusy(null);
    }
  };

  const signOut = async (id: string) => {
    setBusy(id);
    await api(`/auth/sessions/${id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(null);
    toast('Device signed out');
    reload();
  };

  const signOutOthers = async () => {
    setBusy('others');
    for (const s of sessions?.filter((x) => !x.current) ?? []) await api(`/auth/sessions/${s.id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(null);
    toast('Signed out of your other devices');
    reload();
  };

  const signOutEverywhere = async () => {
    setBusy('all');
    await api('/auth/logout-all', { method: 'POST' }).catch(() => null);
    await logout();
  };

  const others = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Security</h2>
      <div className="mt-5 grid gap-8 lg:grid-cols-2">
        <form onSubmit={changePassword} className="space-y-4" aria-labelledby="pw-title">
          <h3 id="pw-title" className="flex items-center gap-2 text-[15px] font-medium">
            <KeyRound className="h-4 w-4 text-brand-600" /> Change password
          </h3>
          <ErrorNote error={err} />
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} />
          </Field>
          <Field label="New password" hint="At least 8 characters. Other devices will be signed out.">
            <Input type="password" autoComplete="new-password" required minLength={8} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
          </Field>
          <Button type="submit" loading={busy === 'password'}>Change password</Button>
        </form>

        <div>
          <h3 className="text-[15px] font-medium">Where you’re signed in</h3>
          <p className="mt-1 text-sm text-ink-mute">Sign out of any device you don’t recognise, then change your password.</p>
          {!sessions ? (
            <Spinner inline />
          ) : (
            <ul className="mt-4 divide-y divide-line-soft rounded-2xl border border-line-soft">
              {sessions.map((s) => {
                const d = describe(s.userAgent);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', s.current ? 'bg-emerald-50 text-emerald-600' : 'bg-canvas text-ink-mute')}>
                      {d.mobile ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {d.label}
                        {s.current && <Badge tone="green">This device</Badge>}
                      </p>
                      <p className="text-xs text-ink-mute">
                        {s.current ? 'Active now' : ago(s.lastUsedAt)}
                        {s.ip && ` · ${s.ip}`} · Signed in {fmtDate(s.createdAt)}
                      </p>
                    </div>
                    {!s.current && (
                      <Button size="sm" variant="ghost" loading={busy === s.id} onClick={() => signOut(s.id)}>
                        Sign out
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {others > 0 && (
              <Button variant="ghost" size="sm" loading={busy === 'others'} onClick={signOutOthers}>
                Sign out of {others} other device{others > 1 ? 's' : ''}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-rose-600" loading={busy === 'all'} onClick={signOutEverywhere}>
              Sign out everywhere
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
