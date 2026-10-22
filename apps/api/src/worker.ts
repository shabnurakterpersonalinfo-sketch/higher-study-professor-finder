/**
 * Background worker process — run separately from the API (`npm run worker`).
 *
 * Registers BullMQ repeatable jobs (daily, Asia/Dhaka) and processes them.
 * Scale by running more worker replicas; BullMQ guarantees each job runs once,
 * and repeatable-job registration is idempotent (same jobId).
 */
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { CacheModule } from './common/cache/cache.service';
import { MailModule } from './common/mail/mail.service';
import { PrismaModule } from './common/prisma/prisma.service';
import { JobsService, QUEUES } from './workers/jobs';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, CacheModule, MailModule],
  providers: [JobsService],
})
class WorkerModule {}

async function main() {
  const log = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  const jobs = app.get(JobsService);

  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  // BullMQ needs its own connection with maxRetriesPerRequest=null.
  const connection = new IORedis(url, { maxRetriesPerRequest: null, family: 0 }); // family 0: IPv4 or IPv6 (Railway private network)
  const tz = process.env.CRON_TZ ?? 'Asia/Dhaka';

  const schedule: { queue: string; cron: string; run: (job: Job) => Promise<unknown> }[] = [
    { queue: QUEUES.OUTREACH, cron: process.env.CRON_OUTREACH ?? '0 9 * * *', run: () => jobs.outreachFollowUps() },
    { queue: QUEUES.VISA, cron: process.env.CRON_VISA ?? '15 9 * * *', run: () => jobs.visaMilestones() },
    { queue: QUEUES.PLANS, cron: process.env.CRON_PLANS ?? '30 0 * * *', run: () => jobs.expirePlans() },
    { queue: QUEUES.SESSIONS, cron: process.env.CRON_SESSIONS ?? '45 3 * * *', run: () => jobs.purgeSessions() },
  ];

  const workers: Worker[] = [];
  for (const s of schedule) {
    const q = new Queue(s.queue, { connection });
    await q.upsertJobScheduler(`${s.queue}:daily`, { pattern: s.cron, tz }, { name: 'daily', opts: { removeOnComplete: 50, removeOnFail: 200, attempts: 3, backoff: { type: 'exponential', delay: 60_000 } } });
    const w = new Worker(s.queue, s.run, { connection, concurrency: 1 });
    w.on('completed', (j, r) => log.log(`${s.queue} #${j.id} done ${JSON.stringify(r)}`));
    w.on('failed', (j, e) => log.error(`${s.queue} #${j?.id} failed: ${e.message}`));
    workers.push(w);
    log.log(`scheduled ${s.queue} @ "${s.cron}" ${tz}`);
  }

  const shutdown = async () => {
    log.log('shutting down workers…');
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
