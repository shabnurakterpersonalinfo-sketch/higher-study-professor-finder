import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role, SubscriptionPlan } from '@prisma/client';

export const IS_PUBLIC = 'hs:isPublic';
export const ROLES = 'hs:roles';
export const MIN_PLAN = 'hs:minPlan';
export const BEFORE_SETUP = 'hs:beforeSetup';

/** Skip JWT auth (login, register, payment callbacks). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Allow only these roles. SUPER_ADMIN is not implied — list it explicitly. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Require at least this subscription tier (admins bypass). */
export const RequiresPlan = (plan: SubscriptionPlan) => SetMetadata(MIN_PLAN, plan);

/**
 * Reachable by a student who hasn't finished profile setup yet (auth, profile,
 * onboarding, notifications, billing). Everything else answers 403
 * PROFILE_SETUP_REQUIRED until setup is done.
 */
export const AllowBeforeSetup = () => SetMetadata(BEFORE_SETUP, true);

/** What the auth guard attaches to `req.user` (resolved via the role cache). */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  plan: SubscriptionPlan;
  studentProfileId: string | null;
  /** False only for a GU who hasn't completed the essentials setup. */
  setupDone: boolean;
  /** Sign-in session of the access token (not cached; set per request). */
  sessionId?: string;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
