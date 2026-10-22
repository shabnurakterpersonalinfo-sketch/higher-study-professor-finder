'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Same-origin: /api/v1 is proxied to the API by app/api/v1/[...path]/route.ts. */
const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

// ------------------------------------------------------------------ session
//
// The access token lives only in this module's memory (never localStorage), so a
// script injected into the page can't lift a long-lived credential. The refresh
// token is an httpOnly cookie the browser sends to /api/v1/auth/* by itself.

let accessToken: string | null = null;
let accessExpiresAt = 0;
let refreshing: Promise<boolean> | null = null;
const AUTH_CHANNEL = 'hs-auth';

export const session = {
  has: () => !!accessToken,
  set(token: string, expiresInSeconds: number) {
    accessToken = token;
    accessExpiresAt = Date.now() + expiresInSeconds * 1000;
  },
  clear() {
    accessToken = null;
    accessExpiresAt = 0;
  },
  /** Tells other tabs to drop their session (logout, or the session ended). */
  broadcastLogout() {
    try {
      new BroadcastChannel(AUTH_CHANNEL).postMessage('logout');
    } catch {
      /* old browser: other tabs find out on their next request */
    }
  },
  onLogoutElsewhere(cb: () => void) {
    try {
      const ch = new BroadcastChannel(AUTH_CHANNEL);
      ch.onmessage = (e) => e.data === 'logout' && cb();
      return () => ch.close();
    } catch {
      return () => undefined;
    }
  },
};

if (typeof window !== 'undefined') {
  // Tokens from older builds were kept in localStorage; don't leave them lying around.
  try {
    window.localStorage.removeItem('hs_token');
  } catch {
    /* storage blocked */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Gets a new access token from the refresh cookie. One refresh at a time per tab,
 * and across tabs via the Web Locks API, because each refresh rotates the cookie.
 * Returns false when the session is over (the caller sends the user to /login).
 */
export function refreshAccess(): Promise<boolean> {
  if (refreshing) return refreshing;
  const run = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' }).catch(() => null);
      if (!res) return !!accessToken; // offline: keep what we have
      if (res.ok) {
        const d = (await res.json()) as { accessToken: string; expiresIn: number };
        session.set(d.accessToken, d.expiresIn);
        return true;
      }
      if (res.status === 409) {
        await sleep(250 * (attempt + 1)); // another tab is rotating the cookie right now
        continue;
      }
      session.clear();
      return false;
    }
    return false;
  };
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  const p: Promise<boolean> = locks ? (locks.request('hs-refresh', run) as unknown as Promise<boolean>) : run();
  const done = p.finally(() => {
    refreshing = null;
  });
  refreshing = done;
  return done;
}

const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

function sessionEnded() {
  session.clear();
  session.broadcastLogout();
  if (typeof window !== 'undefined' && !['/login', '/register'].includes(window.location.pathname)) {
    window.location.href = '/login';
  }
}

async function send(path: string, init: RequestInit, headers: Headers) {
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(BASE + path, { ...init, headers, credentials: 'same-origin' });
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const canRefresh = !NO_REFRESH.some((p) => path.startsWith(p));
  // Refresh a little before expiry instead of waiting for a 401.
  if (canRefresh && accessToken && accessExpiresAt - Date.now() < 30_000) await refreshAccess();

  let res = await send(path, { ...init, body }, headers);
  if (res.status === 401 && canRefresh) {
    if (await refreshAccess()) res = await send(path, { ...init, body }, headers);
    else {
      sessionEnded();
    }
  }
  const text = await res.text();
  let data: { code?: string; message?: string | string[] | { code?: string } } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text.slice(0, 200) };
  }
  if (res.status === 403 && data?.code === 'PROFILE_SETUP_REQUIRED' && typeof window !== 'undefined' && window.location.pathname !== '/welcome') {
    window.location.href = '/welcome';
  }
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : typeof data?.message === 'string' ? data.message : res.statusText;
    const code = data?.code ?? (typeof data?.message === 'object' && !Array.isArray(data.message) ? data.message?.code : undefined);
    throw new ApiError(res.status, msg, code, data);
  }
  return data as T;
}

/** Build a query string, dropping empty values. Arrays are comma-joined. */
export function qs(params: Record<string, unknown>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Minimal data hook: fetches on mount and whenever `key` changes; `reload()` refetches. */
export function useApi<T>(key: string | null, init?: RequestInit & { json?: unknown }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!key);
  const [nonce, setNonce] = useState(0);
  const initRef = useRef(init);
  initRef.current = init;

  useEffect(() => {
    if (!key) return;
    let alive = true;
    setLoading(true);
    api<T>(key, initRef.current)
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e instanceof ApiError ? e : new ApiError(0, String(e))))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [key, nonce, init?.json ? JSON.stringify(init.json) : '']); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload, setData };
}

/** Authenticated file download (e.g. CSV templates) — saves the response as `filename`. */
export async function apiDownload(path: string, filename: string) {
  if (accessExpiresAt - Date.now() < 30_000) await refreshAccess();
  let res = await send(path, {}, new Headers());
  if (res.status === 401 && (await refreshAccess())) res = await send(path, {}, new Headers());
  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
