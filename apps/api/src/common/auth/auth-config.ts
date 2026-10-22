import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { CookieOptions, Request } from 'express';

/**
 * Auth settings shared by the API, guards and tests.
 *
 * Model: a short-lived access token (JWT, sent as `Authorization: Bearer`, kept in
 * memory by the web app) plus a long-lived refresh token in an httpOnly cookie
 * scoped to /api/v1/auth. The refresh token is `<sessionId>.<secret>`; the server
 * stores only sha256(secret) and rotates it on every refresh.
 */

export const JWT_ISSUER = 'higherstudy';
export const JWT_AUDIENCE = 'higherstudy';

const durationSeconds = (v: string | undefined, fallback: number) => {
  const m = /^(\d+)\s*([smhd])?$/.exec((v ?? '').trim());
  if (!m) return fallback;
  return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86_400 }[(m[2] ?? 's') as 's' | 'm' | 'h' | 'd'];
};

export const authSettings = () => ({
  /** Access token lifetime. Short on purpose: revocation also checks the session. */
  accessTtlSeconds: durationSeconds(process.env.ACCESS_TOKEN_TTL, 15 * 60),
  /** A session ends after this many days without a refresh… */
  sessionIdleDays: Number(process.env.SESSION_IDLE_DAYS ?? 30),
  /** …and in any case this many days after sign-in. */
  sessionMaxDays: Number(process.env.SESSION_MAX_DAYS ?? 90),
  /** Failed logins per account before a temporary lock, and the lock length. */
  lockoutThreshold: Number(process.env.LOGIN_LOCKOUT_THRESHOLD ?? 5),
  lockoutMinutes: Number(process.env.LOGIN_LOCKOUT_MINUTES ?? 15),
});

// ------------------------------------------------------------------ secret

const PLACEHOLDERS = /change-?me|dev-secret|placeholder|example|your[-_]?secret|^secret$|^password$/i;

/**
 * Throws on secrets that would let anyone forge tokens. Under 32 chars is always
 * refused; in production, copied placeholders and low-entropy values are too.
 */
export function assertStrongJwtSecret(secret: string | undefined, nodeEnv = process.env.NODE_ENV): string {
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters. Generate one with: openssl rand -base64 48');
  }
  if (nodeEnv === 'production') {
    if (PLACEHOLDERS.test(secret)) throw new Error('JWT_SECRET is still the example value. Generate a new one with: openssl rand -base64 48');
    if (new Set(secret).size < 12) throw new Error('JWT_SECRET is too predictable (too few distinct characters). Generate one with: openssl rand -base64 48');
  }
  return secret;
}

// ------------------------------------------------------------------ refresh tokens

export const REFRESH_COOKIE = 'hs_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newSecret = () => randomBytes(32).toString('base64url');
export const formatRefreshToken = (sessionId: string, secret: string) => `${sessionId}.${secret}`;

export function parseRefreshToken(raw: string | undefined | null): { sessionId: string; secret: string } | null {
  if (!raw) return null;
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{40,64})$/.exec(raw.trim());
  return m ? { sessionId: m[1], secret: m[2] } : null;
}

/** Constant-time comparison of two hex digests. */
export function sameHash(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function refreshCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    // COOKIE_SECURE=false only for plain-http setups (local dev); production is always https.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
    // The web app proxies /api/v1 on its own origin, so the cookie is first-party; Lax keeps
    // it off cross-site POSTs (CSRF) while surviving normal navigation.
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeMs,
  };
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

// ------------------------------------------------------------------ client identity

/**
 * The client's IP for rate limits and the session list.
 *
 * Requests that come through the web app's /api proxy carry the browser's IP in
 * `X-HS-Client-IP`, vouched for by the shared `X-HS-Proxy-Secret` (PROXY_SECRET on
 * both services). Anything else uses Express's req.ip, which honours TRUST_PROXY.
 */
export function clientIp(req: Request): string {
  const secret = process.env.PROXY_SECRET;
  const presented = req.headers['x-hs-proxy-secret'];
  const forwarded = req.headers['x-hs-client-ip'];
  if (secret && typeof presented === 'string' && typeof forwarded === 'string' && forwarded) {
    const a = Buffer.from(sha256(presented));
    const b = Buffer.from(sha256(secret));
    if (timingSafeEqual(a, b)) return forwarded.slice(0, 64);
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

/**
 * CSRF guard for the cookie-authenticated endpoints (refresh, logout): the request
 * must come from an allowed origin. Browsers always send Origin on cross-site POSTs;
 * same-origin fetches send it too in every current browser.
 */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (curl, mobile); they can't ride a victim's cookie
  const allowed = [process.env.CORS_ORIGINS ?? 'http://localhost:3000', process.env.PUBLIC_WEB_URL ?? '']
    .join(',')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return allowed.includes(origin.replace(/\/$/, ''));
}
