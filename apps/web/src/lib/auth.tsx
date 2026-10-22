'use client';

import { useRouter } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, refreshAccess, session } from './api';
import type { Me } from './types';

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string, targetDegree: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
type TokenResponse = { accessToken: string; expiresIn: number };

/**
 * Session lifecycle in the browser:
 * - On load, the httpOnly refresh cookie (if any) is exchanged for an access token.
 * - Login/register set the cookie (server) and the access token (memory).
 * - Logout ends the session on the server and tells other open tabs.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      if (!session.has() && !(await refreshAccess())) {
        setMe(null);
        return;
      }
      setMe(await api<Me>('/auth/me'));
    } catch {
      session.clear();
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Logged out in another tab → follow along here.
  useEffect(
    () =>
      session.onLogoutElsewhere(() => {
        session.clear();
        setMe(null);
        router.replace('/login');
      }),
    [router],
  );

  const afterLogin = async (r: TokenResponse) => {
    session.set(r.accessToken, r.expiresIn);
    const m = await api<Me>('/auth/me');
    setMe(m);
    router.replace(m.role !== 'GU' ? '/admin' : m.setupDone ? '/dashboard' : '/welcome');
  };

  const value: AuthCtx = {
    me,
    loading,
    refresh,
    login: async (email, password) => {
      await afterLogin(await api<TokenResponse>('/auth/login', { method: 'POST', json: { email, password } }));
    },
    register: async (fullName, email, password, targetDegree) => {
      await afterLogin(await api<TokenResponse>('/auth/register', { method: 'POST', json: { fullName, email, password, targetDegree } }));
    },
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => null);
      session.clear();
      session.broadcastLogout();
      setMe(null);
      router.replace('/login');
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
