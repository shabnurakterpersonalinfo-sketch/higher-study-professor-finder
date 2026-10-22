import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Keys } from './cache-keys';

/**
 * Cache-aside helper over Redis.
 *
 *   const data = await cache.wrap(key, ttl, () => db.query());
 *
 * Redis failures never break a request: on any Redis error we log and fall
 * through to the loader (the database stays the source of truth).
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly log = new Logger(CacheService.name);
  readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
      maxRetriesPerRequest: 2,
      family: 0, // IPv4 or IPv6 — Railway's private network (redis.railway.internal) can be IPv6-only
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    this.redis.on('error', (e) => this.log.warn(`redis: ${e.message}`));
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (e) {
      this.log.warn(`cache get ${key} failed: ${(e as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (e) {
      this.log.warn(`cache set ${key} failed: ${(e as Error).message}`);
    }
  }

  /** Cache-aside: HIT → return cached; MISS → load from DB, store with TTL, return. */
  async wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const fresh = await loader();
    if (fresh !== undefined && fresh !== null) await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.redis.del(...keys);
    } catch (e) {
      this.log.warn(`cache del failed: ${(e as Error).message}`);
    }
  }

  /** Evict every key matching a glob. Uses SCAN (non-blocking), never KEYS. */
  async delPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let removed = 0;
    try {
      do {
        const [next, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
        cursor = next;
        if (batch.length) removed += await this.redis.unlink(...batch);
      } while (cursor !== '0');
    } catch (e) {
      this.log.warn(`cache delPattern ${pattern} failed: ${(e as Error).message}`);
    }
    return removed;
  }

  // ---- Invalidation hooks named after the spec's mutation rules ----------

  /** Admin modified a university/program. */
  invalidateUniversities() {
    return this.delPattern(Keys.univPattern());
  }
  /** Admin modified or added a professor. */
  invalidateProfessors() {
    return this.delPattern(Keys.profPattern());
  }
  /**
   * GU changed an outreach log or application. Evicts the base keys and every
   * per-query variant (`hs:student:<id>:outreach:<hash>`, …) in one sweep.
   */
  async invalidateStudent(userId: string) {
    await this.del(Keys.studentOutreach(userId), Keys.studentDashboard(userId), Keys.studentApplications(userId));
    await this.delPattern(`${Keys.studentOutreach(userId)}:*`);
    await this.delPattern(`${Keys.studentApplications(userId)}:*`);
  }
  /** Admin changed a user's plan or role — must take effect immediately. */
  invalidateUserRole(userId: string) {
    return this.del(Keys.userRole(userId));
  }
}

@Global()
@Module({ providers: [CacheService], exports: [CacheService] })
export class CacheModule {}
