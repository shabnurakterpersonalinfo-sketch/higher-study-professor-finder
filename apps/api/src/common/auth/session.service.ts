import { Global, HttpException, HttpStatus, Injectable, Logger, Module, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { authSettings, formatRefreshToken, newSecret, parseRefreshToken, sameHash, sha256 } from './auth-config';

export type RevokeReason = 'LOGOUT' | 'LOGOUT_ALL' | 'PASSWORD_CHANGED' | 'REUSE_DETECTED' | 'DISABLED' | 'REVOKED_BY_USER';

const DAY = 86_400_000;
/** A refresh that loses a race with another tab presents the just-replaced secret; allow it briefly. */
const RACE_GRACE_MS = 30_000;
const revokedKey = (sid: string) => `hs:session:revoked:${sid}`;

/**
 * Server-side sessions behind the refresh-token cookie.
 *
 * - `start` creates a session and returns `<sessionId>.<secret>`; only sha256(secret) is stored.
 * - `rotate` swaps the secret on every refresh. Presenting an older secret means the
 *   token was copied, so the whole session is revoked (OAuth 2.0 Security BCP §4.14).
 * - Revocation is also published to Redis so access tokens of that session stop
 *   working on their next request, without waiting for them to expire.
 */
@Injectable()
export class SessionService {
  private readonly log = new Logger('Sessions');

  constructor(private readonly prisma: PrismaService, private readonly cache: CacheService) {}

  private idleExpiry(createdAt: Date) {
    const s = authSettings();
    return new Date(Math.min(Date.now() + s.sessionIdleDays * DAY, createdAt.getTime() + s.sessionMaxDays * DAY));
  }

  cookieMaxAgeMs(expiresAt: Date) {
    return Math.max(0, expiresAt.getTime() - Date.now());
  }

  async start(userId: string, req: Request, ip: string) {
    const secret = newSecret();
    const now = new Date();
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(secret),
        expiresAt: this.idleExpiry(now),
        userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) || null,
        ip,
      },
    });
    return { session, refreshToken: formatRefreshToken(session.id, secret) };
  }

  /** Validates and rotates a refresh token. Returns the user and the new token. */
  async rotate(raw: string | undefined, ip: string) {
    const parsed = parseRefreshToken(raw);
    if (!parsed) throw new UnauthorizedException({ code: 'NO_SESSION', message: 'Please log in again' });

    const session = await this.prisma.session.findUnique({
      where: { id: parsed.sessionId },
      include: { user: { select: { id: true, isActive: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) {
      throw new UnauthorizedException({ code: 'SESSION_ENDED', message: 'Your session has ended. Please log in again' });
    }

    const presented = sha256(parsed.secret);
    if (!sameHash(presented, session.tokenHash)) {
      // Lost a race with a parallel refresh (another tab) a moment ago: not theft, just retry.
      if (sameHash(presented, session.previousTokenHash) && Date.now() - session.rotatedAt.getTime() < RACE_GRACE_MS) {
        throw new HttpException({ code: 'REFRESH_RACE', message: 'Refresh already in progress, retry' }, HttpStatus.CONFLICT);
      }
      await this.revoke(session.id, 'REUSE_DETECTED');
      this.log.warn(`refresh token reuse on session ${session.id} (user ${session.userId}); session revoked`);
      throw new UnauthorizedException({ code: 'SESSION_ENDED', message: 'Your session has ended. Please log in again' });
    }

    const secret = newSecret();
    // Conditional update: two refreshes with the same token can't both win.
    const res = await this.prisma.session.updateMany({
      where: { id: session.id, tokenHash: session.tokenHash, revokedAt: null },
      data: {
        tokenHash: sha256(secret),
        previousTokenHash: session.tokenHash,
        rotatedAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: this.idleExpiry(session.createdAt),
        ip,
      },
    });
    if (res.count !== 1) throw new HttpException({ code: 'REFRESH_RACE', message: 'Refresh already in progress, retry' }, HttpStatus.CONFLICT);
    const expiresAt = this.idleExpiry(session.createdAt);
    return { userId: session.userId, sessionId: session.id, expiresAt, refreshToken: formatRefreshToken(session.id, secret) };
  }

  async revoke(sessionId: string, reason: RevokeReason, userId?: string) {
    const res = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null, ...(userId && { userId }) },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    if (res.count) await this.publish([sessionId]);
    return res.count > 0;
  }

  async revokeAll(userId: string, reason: RevokeReason, exceptSessionId?: string) {
    const active = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, ...(exceptSessionId && { id: { not: exceptSessionId } }) },
      select: { id: true },
    });
    if (!active.length) return 0;
    await this.prisma.session.updateMany({
      where: { id: { in: active.map((s) => s.id) }, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.publish(active.map((s) => s.id));
    return active.length;
  }

  /** Revoked marker lives as long as an access token could. */
  private async publish(ids: string[]) {
    const ttl = authSettings().accessTtlSeconds + 60;
    await Promise.all(ids.map((id) => this.cache.redis.set(revokedKey(id), '1', 'EX', ttl).catch(() => null)));
  }

  /** Called on every authenticated request. Redis first; Postgres if Redis is unavailable. */
  async isRevoked(sessionId: string): Promise<boolean> {
    try {
      return (await this.cache.redis.exists(revokedKey(sessionId))) === 1;
    } catch {
      const s = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { revokedAt: true, expiresAt: true } });
      return !s || !!s.revokedAt;
    }
  }

  list(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    });
  }
}

/**
 * Per-account lockout after repeated wrong passwords, on top of the per-IP rate
 * limit. Counts unknown emails the same way, so the response doesn't reveal
 * which accounts exist.
 */
@Injectable()
export class LoginLockout {
  constructor(private readonly cache: CacheService) {}

  private key = (email: string, kind: 'fail' | 'lock') => `hs:login:${kind}:${sha256(email.toLowerCase().trim())}`;

  async assertNotLocked(email: string) {
    const ttl = await this.cache.redis.ttl(this.key(email, 'lock')).catch(() => -2);
    if (ttl > 0) {
      throw new HttpException(
        { code: 'ACCOUNT_LOCKED', retryAfterSeconds: ttl, message: `Too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minute${Math.ceil(ttl / 60) === 1 ? '' : 's'}.` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(email: string) {
    const { lockoutThreshold, lockoutMinutes } = authSettings();
    const r = this.cache.redis;
    try {
      const n = await r.incr(this.key(email, 'fail'));
      if (n === 1) await r.expire(this.key(email, 'fail'), lockoutMinutes * 60);
      if (n >= lockoutThreshold) {
        await r.set(this.key(email, 'lock'), '1', 'EX', lockoutMinutes * 60);
        await r.del(this.key(email, 'fail'));
      }
    } catch {
      /* Redis down: the per-IP throttle still applies */
    }
  }

  async clear(email: string) {
    await this.cache.redis.del(this.key(email, 'fail')).catch(() => null);
  }
}

@Global()
@Module({ providers: [SessionService, LoginLockout], exports: [SessionService, LoginLockout] })
export class SessionModule {}
