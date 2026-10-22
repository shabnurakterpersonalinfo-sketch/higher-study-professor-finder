import { createHash } from 'crypto';

/** TTL tiers from the architecture spec, in seconds. */
export const TTL = {
  DIRECTORY: 86_400, // universities & programs — 24h
  PROFESSOR: 7_200, // professor search & profiles — 2h
  USER_ROLE: 3_600, // auth/RBAC snapshot — 1h
  DASHBOARD: 600, // student dashboard aggregates — 10m
  OUTREACH: 300, // outreach & application kanban — 5m
} as const;

const PREFIX = 'hs';

/** Stable hash of a query object: key order doesn't change the hash. */
export function hashQuery(q: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.keys(v as object)
            .sort()
            .reduce<Record<string, unknown>>((acc, k) => {
              const val = (v as Record<string, unknown>)[k];
              if (val !== undefined && val !== '' && val !== null) acc[k] = stable(val);
              return acc;
            }, {})
        : v;
  return createHash('sha1').update(JSON.stringify(stable(q))).digest('hex').slice(0, 16);
}

/** Key builders — format `hs:<entity>:<identifier_or_hash>`. */
export const Keys = {
  univAll: () => `${PREFIX}:univ:all`,
  univSearch: (hash: string) => `${PREFIX}:univ:search:${hash}`,
  univ: (id: string) => `${PREFIX}:univ:${id}`,
  univPattern: () => `${PREFIX}:univ:*`,

  profSearch: (hash: string) => `${PREFIX}:prof:search:${hash}`,
  prof: (id: string) => `${PREFIX}:prof:${id}`,
  profPattern: () => `${PREFIX}:prof:*`,

  // v2: entries now carry `setupDone`. Bumping the key means entries cached by an older
  // build (without the flag) are ignored instead of locking students out after a deploy.
  userRole: (userId: string) => `${PREFIX}:user:role:v2:${userId}`,

  studentDashboard: (userId: string) => `${PREFIX}:student:${userId}:dashboard`,
  studentOutreach: (userId: string) => `${PREFIX}:student:${userId}:outreach`,
  studentApplications: (userId: string) => `${PREFIX}:student:${userId}:applications`,
};
