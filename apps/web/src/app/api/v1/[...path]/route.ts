import { NextRequest } from 'next/server';

/**
 * Same-origin proxy: the browser talks to /api/v1/* on the web app's own domain and
 * this forwards to the API. Keeps the refresh-token cookie first-party (browsers
 * block cookies between two *.up.railway.app domains) and removes CORS from the
 * browser path entirely.
 *
 * Runtime settings (read per request, no rebuild needed):
 *   API_INTERNAL_URL    where the API listens, e.g. http://api.railway.internal:4000
 *   PROXY_SECRET        shared with the API; lets it trust X-HS-Client-IP for rate limits
 *   TRUSTED_PROXY_HOPS  proxies in front of the web app that append to X-Forwarded-For
 *                       (1 on Railway; 0 locally)
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade',
  'proxy-authorization', 'proxy-authenticate', 'host', 'content-length',
]);

function clientIp(req: NextRequest): string | null {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  if (!hops) return null;
  // Each trusted proxy appends the address it saw; read the entry the outermost one added.
  const chain = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return chain.length >= hops ? chain[chain.length - hops] : null;
}

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const upstream = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');
  const url = new URL(req.url);
  const target = `${upstream}/api/v1/${params.path.map(encodeURIComponent).join('/')}${url.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    // x-hs-* are ours to set; never pass a browser-supplied one through.
    if (!HOP_BY_HOP.has(key) && !key.startsWith('x-hs-')) headers.set(key, value);
  });
  const ip = clientIp(req);
  if (ip) headers.set('x-hs-client-ip', ip);
  if (process.env.PROXY_SECRET) headers.set('x-hs-proxy-secret', process.env.PROXY_SECRET);
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));

  const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers, redirect: 'manual', cache: 'no-store' };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body; // streamed, so CSV uploads aren't buffered here
    init.duplex = 'half';
  }

  let res: Response;
  try {
    res = await fetch(target, init);
  } catch {
    return Response.json({ statusCode: 502, code: 'API_UNREACHABLE', message: 'The server is not reachable right now. Try again in a moment.' }, { status: 502 });
  }

  const out = new Headers();
  res.headers.forEach((value, key) => {
    // fetch already decompressed the body, so the length/encoding headers no longer apply.
    if (!HOP_BY_HOP.has(key) && key !== 'set-cookie' && key !== 'content-encoding') out.set(key, value);
  });
  for (const cookie of res.headers.getSetCookie()) out.append('set-cookie', cookie);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

export { proxy as DELETE, proxy as GET, proxy as HEAD, proxy as OPTIONS, proxy as PATCH, proxy as POST, proxy as PUT };
