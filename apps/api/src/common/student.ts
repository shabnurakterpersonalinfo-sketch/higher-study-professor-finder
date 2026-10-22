import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from './decorators';

/**
 * Ownership boundary for GU writes: every student-scoped query is filtered by
 * the caller's own StudentProfile id, never by an id from the request body.
 */
export function requireStudent(user: AuthUser): string {
  if (!user.studentProfileId) {
    throw new ForbiddenException({ code: 'PROFILE_REQUIRED', message: 'Create your student profile first' });
  }
  return user.studentProfileId;
}

export function paginate(page = 1, pageSize = 10) {
  const p = Math.max(1, Number(page) || 1);
  const s = Math.min(100, Math.max(1, Number(pageSize) || 10));
  return { skip: (p - 1) * s, take: s, page: p, pageSize: s };
}
