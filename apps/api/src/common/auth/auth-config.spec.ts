import type { Request } from 'express';
import { assertStrongJwtSecret, clientIp, formatRefreshToken, newSecret, originAllowed, parseRefreshToken, readCookie, sameHash, sha256 } from './auth-config';

const req = (headers: Record<string, string>, ip = '10.0.0.1') => ({ headers, ip, socket: {} }) as unknown as Request;

describe('assertStrongJwtSecret', () => {
  const strong = 'Zq7v0p3Kc9yT2mXwR8sLbN4dHf6gJ1aE5uYiOoPq';
  it('refuses missing or short secrets everywhere', () => {
    expect(() => assertStrongJwtSecret(undefined, 'development')).toThrow(/at least 32/);
    expect(() => assertStrongJwtSecret('short', 'development')).toThrow(/at least 32/);
  });
  it('refuses the example and dev secrets in production', () => {
    expect(() => assertStrongJwtSecret('change-me-change-me-change-me-change-me', 'production')).toThrow(/example value/);
    expect(() => assertStrongJwtSecret('dev-secret-dev-secret-dev-secret-1234', 'production')).toThrow(/example value/);
    expect(() => assertStrongJwtSecret('a'.repeat(48), 'production')).toThrow(/predictable/);
  });
  it('allows the dev secret locally and a random secret in production', () => {
    expect(assertStrongJwtSecret('dev-secret-dev-secret-dev-secret-1234', 'development')).toBeTruthy();
    expect(assertStrongJwtSecret(strong, 'production')).toBe(strong);
  });
});

describe('refresh tokens', () => {
  const sid = '0f8fad5b-d9cb-469f-a165-70867728950e';
  it('round-trips <sessionId>.<secret>', () => {
    const secret = newSecret();
    expect(parseRefreshToken(formatRefreshToken(sid, secret))).toEqual({ sessionId: sid, secret });
  });
  it('rejects malformed tokens', () => {
    for (const bad of ['', 'abc', `${sid}.short`, `not-a-uuid.${newSecret()}`, `${sid}.${newSecret()}.x`]) expect(parseRefreshToken(bad)).toBeNull();
  });
  it('compares hashes safely', () => {
    expect(sameHash(sha256('a'), sha256('a'))).toBe(true);
    expect(sameHash(sha256('a'), sha256('b'))).toBe(false);
    expect(sameHash(sha256('a'), null)).toBe(false);
  });
  it('reads a cookie from the header', () => {
    expect(readCookie(req({ cookie: 'x=1; hs_rt=abc%2Edef; y=2' }), 'hs_rt')).toBe('abc.def');
    expect(readCookie(req({}), 'hs_rt')).toBeUndefined();
  });
});

describe('request origin and client IP', () => {
  const env = { ...process.env };
  afterEach(() => (process.env = { ...env }));

  it('allows the web origin and refuses others', () => {
    process.env.CORS_ORIGINS = 'https://web.example.app/';
    expect(originAllowed(req({ origin: 'https://web.example.app' }))).toBe(true);
    expect(originAllowed(req({ origin: 'https://evil.example' }))).toBe(false);
    expect(originAllowed(req({}))).toBe(true); // non-browser client
  });

  it('trusts X-HS-Client-IP only with the proxy secret', () => {
    process.env.PROXY_SECRET = 'proxy-secret-value-0123456789';
    expect(clientIp(req({ 'x-hs-proxy-secret': 'proxy-secret-value-0123456789', 'x-hs-client-ip': '203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientIp(req({ 'x-hs-proxy-secret': 'wrong', 'x-hs-client-ip': '203.0.113.9' }))).toBe('10.0.0.1');
    delete process.env.PROXY_SECRET;
    expect(clientIp(req({ 'x-hs-proxy-secret': '', 'x-hs-client-ip': '203.0.113.9' }))).toBe('10.0.0.1');
  });
});
