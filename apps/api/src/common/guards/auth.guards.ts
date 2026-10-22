import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { clientIp } from '../auth/auth-config';
import { JwtService } from '@nestjs/jwt';
import { Role, SubscriptionPlan } from '@prisma/client';
import { CacheService } from '../cache/cache.service';
import { Keys, TTL } from '../cache/cache-keys';
import { AuthUser, BEFORE_SETUP, IS_PUBLIC, MIN_PLAN, ROLES } from '../decorators';
import { planRank } from '../plans';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../auth/session.service';

/**
 * Global guard #1 — verifies the JWT (HS256, issuer/audience pinned in AppModule),
 * checks its session hasn't been revoked, then resolves the *current* role/plan
 * from Redis (`hs:user:role:<id>`, 1h TTL) falling back to Postgres.
 *
 * The token only carries `sub`. Role and plan are never trusted from the token,
 * so an admin demotion or plan change takes effect on the very next request
 * (the admin endpoints evict the role key).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly cache: CacheService,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let sub: string;
    let sid: string | undefined;
    try {
      ({ sub, sid } = await this.jwt.verifyAsync<{ sub: string; sid?: string }>(token));
    } catch {
      throw new UnauthorizedException({ code: 'TOKEN_EXPIRED', message: 'Invalid or expired token' });
    }
    // Every access token belongs to a sign-in session; a logged-out or revoked
    // session stops its tokens immediately instead of when they expire.
    if (!sid || (await this.sessions.isRevoked(sid))) {
      throw new UnauthorizedException({ code: 'SESSION_ENDED', message: 'Your session has ended. Please log in again' });
    }

    const user = await this.cache.wrap<AuthUser | null>(Keys.userRole(sub), TTL.USER_ROLE, async () => {
      const u = await this.prisma.user.findUnique({
        where: { id: sub },
        select: { id: true, email: true, role: true, plan: true, isActive: true, profileCompletedAt: true, studentProfile: { select: { id: true } } },
      });
      if (!u || !u.isActive) return null;
      return {
        id: u.id, email: u.email, role: u.role, plan: u.plan, studentProfileId: u.studentProfile?.id ?? null,
        setupDone: u.role !== 'GU' || u.profileCompletedAt != null,
      };
    });
    if (!user) throw new UnauthorizedException('Account not found or disabled');

    req.user = { ...user, sessionId: sid };
    return true;
  }
}

/** Global guard #2 — enforces @Roles(...). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Insufficient role');
    return true;
  }
}

/** Global guard #3 — enforces @RequiresPlan(...). Admin roles bypass. */
@Injectable()
export class PlanGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const min = this.reflector.getAllAndOverride<SubscriptionPlan>(MIN_PLAN, [ctx.getHandler(), ctx.getClass()]);
    if (!min) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user) return false;
    if (user.role !== 'GU') return true;
    if (planRank(user.plan) < planRank(min)) {
      throw new ForbiddenException({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: min, message: `Requires the ${min} plan` });
    }
    return true;
  }
}

/**
 * Global guard #4 — a new student must finish the essentials setup before using
 * the app. Routes marked @AllowBeforeSetup() (profile, onboarding, billing…) stay open.
 * The flag rides in the role cache entry, which onboarding evicts on completion.
 */
@Injectable()
export class SetupGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user || user.setupDone) return true;
    if (this.reflector.getAllAndOverride<boolean>(BEFORE_SETUP, [ctx.getHandler(), ctx.getClass()])) return true;
    throw new ForbiddenException({ code: 'PROFILE_SETUP_REQUIRED', message: 'Finish setting up your profile first' });
  }
}

/**
 * Global guard #0 — rate limits keyed on the real client IP (see clientIp): through
 * the web proxy or a platform load balancer, req.ip alone would be shared by everyone.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return clientIp(req as Request);
  }
}
