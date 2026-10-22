import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hashQuery, Keys } from '../cache/cache-keys';
import { AuthUser } from '../decorators';
import { PlanGuard, RolesGuard, SetupGuard } from './auth.guards';

const ctx = (user: Partial<AuthUser>) =>
  ({
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const reflectorReturning = (v: unknown) => ({ getAllAndOverride: () => v }) as unknown as Reflector;

describe('RolesGuard', () => {
  it('allows when no roles are required', () => {
    expect(new RolesGuard(reflectorReturning(undefined)).canActivate(ctx({ role: 'GU' }))).toBe(true);
  });
  it('blocks GU from admin routes', () => {
    expect(() => new RolesGuard(reflectorReturning(['ADMIN', 'SUPER_ADMIN'])).canActivate(ctx({ role: 'GU' }))).toThrow(ForbiddenException);
  });
  it('blocks ADMIN from super-admin routes', () => {
    expect(() => new RolesGuard(reflectorReturning(['SUPER_ADMIN'])).canActivate(ctx({ role: 'ADMIN' }))).toThrow(ForbiddenException);
  });
  it('allows SUPER_ADMIN on admin routes', () => {
    expect(new RolesGuard(reflectorReturning(['ADMIN', 'SUPER_ADMIN'])).canActivate(ctx({ role: 'SUPER_ADMIN' }))).toBe(true);
  });
});

describe('PlanGuard', () => {
  it('blocks a STARTER student from a PRO feature', () => {
    expect(() => new PlanGuard(reflectorReturning('PRO')).canActivate(ctx({ role: 'GU', plan: 'STARTER' }))).toThrow(ForbiddenException);
  });
  it('allows PREMIUM on a PRO feature', () => {
    expect(new PlanGuard(reflectorReturning('PRO')).canActivate(ctx({ role: 'GU', plan: 'PREMIUM' }))).toBe(true);
  });
  it('lets admins bypass plan checks', () => {
    expect(new PlanGuard(reflectorReturning('PREMIUM')).canActivate(ctx({ role: 'ADMIN', plan: 'FREE' }))).toBe(true);
  });
});

describe('cache keys', () => {
  it('hashes queries independent of key order and empty values', () => {
    expect(hashQuery({ a: 1, b: ['x'], c: '' })).toBe(hashQuery({ b: ['x'], a: 1 }));
    expect(hashQuery({ a: 1 })).not.toBe(hashQuery({ a: 2 }));
  });
  it('follows hs:<entity>:<id> naming', () => {
    expect(Keys.userRole('u1')).toBe('hs:user:role:v2:u1');
    expect(Keys.studentDashboard('u1')).toBe('hs:student:u1:dashboard');
    expect(Keys.profSearch('abc')).toBe('hs:prof:search:abc');
  });
});

describe('SetupGuard', () => {
  it('blocks a student who has not finished setup', () => {
    expect(() => new SetupGuard(reflectorReturning(undefined)).canActivate(ctx({ role: 'GU', setupDone: false }))).toThrow(ForbiddenException);
  });
  it('lets them reach routes marked @AllowBeforeSetup', () => {
    expect(new SetupGuard(reflectorReturning(true)).canActivate(ctx({ role: 'GU', setupDone: false }))).toBe(true);
  });
  it('allows students who finished setup, and staff', () => {
    expect(new SetupGuard(reflectorReturning(undefined)).canActivate(ctx({ role: 'GU', setupDone: true }))).toBe(true);
    expect(new SetupGuard(reflectorReturning(undefined)).canActivate(ctx({ role: 'ADMIN', setupDone: true }))).toBe(true);
  });
});
