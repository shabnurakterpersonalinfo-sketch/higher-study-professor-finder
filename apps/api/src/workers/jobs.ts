import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../common/cache/cache.service';
import { MailService } from '../common/mail/mail.service';
import { PrismaService } from '../common/prisma/prisma.service';

export const QUEUES = {
  OUTREACH: 'hs-outreach-reminders',
  VISA: 'hs-visa-milestones',
  PLANS: 'hs-plan-expiry',
  SESSIONS: 'hs-session-cleanup',
} as const;

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Job bodies. Kept free of BullMQ so they can be unit-tested and run by hand.
 * Every notification has a `dedupeKey`, so a retried or re-run job never
 * notifies the same person about the same thing twice.
 */
@Injectable()
export class JobsService {
  private readonly log = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly cache: CacheService,
  ) {}

  private async notify(userId: string, email: string, n: { kind: string; title: string; body: string; link: string; dedupeKey: string }) {
    const created = await this.prisma.notification
      .create({ data: { userId, ...n } })
      .then(() => true)
      .catch((e: { code?: string }) => {
        if (e.code === 'P2002') return false; // already notified
        throw e;
      });
    if (created) await this.mail.send(email, n.title, `${n.body}\n\nOpen HigherStudy: ${n.link}`);
    return created;
  }

  /** Spec §6.1 — outreach still MAILED ≥7 days after emailSentTime → nudge the student to follow up. */
  async outreachFollowUps(now = new Date()) {
    const cutoff = new Date(now.getTime() - 7 * DAY);
    const due = await this.prisma.professorOutreach.findMany({
      where: {
        replyStatus: 'MAILED',
        emailSentTime: { lte: cutoff },
        OR: [{ nextReminderAt: null }, { nextReminderAt: { lte: now } }],
      },
      include: {
        professor: { select: { name: true, university: { select: { name: true } } } },
        student: { select: { user: { select: { id: true, email: true, isActive: true } } } },
      },
      take: 5000,
    });
    let sent = 0;
    for (const o of due) {
      const u = o.student.user;
      if (!u.isActive) continue;
      const since = Math.floor((now.getTime() - (o.reminderSentTime ?? o.emailSentTime!).getTime()) / DAY);
      const ok = await this.notify(u.id, u.email, {
        kind: 'OUTREACH_FOLLOWUP',
        title: `Follow up with ${o.professor.name}`,
        body: `It's been ${since} days since you emailed ${o.professor.name} (${o.professor.university.name}) with no reply. A short, polite follow-up often helps.`,
        link: `/email-tracker?open=${o.id}`,
        dedupeKey: `outreach:${o.id}:${ymd(o.nextReminderAt ?? o.emailSentTime!)}`,
      });
      if (ok) {
        sent++;
        await this.cache.invalidateStudent(u.id);
      }
    }
    this.log.log(`outreach follow-ups: ${due.length} due, ${sent} notified`);
    return { due: due.length, sent };
  }

  /** Spec §6.2 — visa appointment / bank solvency (and passport) expiry at 14, 7 and 1 day(s). */
  async visaMilestones(now = new Date(), offsets = [14, 7, 1]) {
    const today = startOfDay(now);
    const windows = offsets.map((d) => ({ d, from: new Date(today.getTime() + d * DAY), to: new Date(today.getTime() + (d + 1) * DAY) }));
    const fields = [
      { key: 'visaAppointmentDate', label: 'Visa appointment' },
      { key: 'bankSolvencyExpiryDate', label: 'Bank solvency certificate expires' },
      { key: 'passportExpiryDate', label: 'Passport expires' },
    ] as const;

    let sent = 0;
    for (const f of fields) {
      for (const w of windows) {
        const rows = await this.prisma.visaReminder.findMany({
          where: { notificationEnabled: true, [f.key]: { gte: w.from, lt: w.to } },
          include: { student: { select: { user: { select: { id: true, email: true, isActive: true } } } } },
        });
        for (const r of rows) {
          const u = r.student.user;
          if (!u.isActive) continue;
          const when = r[f.key] as Date;
          const ok = await this.notify(u.id, u.email, {
            kind: 'VISA_MILESTONE',
            title: `${f.label} in ${w.d} day${w.d === 1 ? '' : 's'}`,
            body: `${f.label} on ${when.toDateString()} (${r.targetCountry}). This is a reminder you set in HigherStudy; confirm details with the embassy or consulate.`,
            link: '/visa',
            dedupeKey: `visa:${r.id}:${f.key}:${w.d}:${ymd(when)}`,
          });
          if (ok) sent++;
        }
      }
    }
    this.log.log(`visa milestones: ${sent} notified`);
    return { sent };
  }

  /** Downgrade paid plans whose validity has lapsed (and evict their RBAC cache). */
  /** Deletes sessions that ended more than 30 days ago (kept a while for the audit trail). */
  async purgeSessions(now = new Date()) {
    const cutoff = new Date(now.getTime() - 30 * DAY);
    const { count } = await this.prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    });
    return { deleted: count };
  }

  async expirePlans(now = new Date()) {
    const expired = await this.prisma.user.findMany({
      where: { role: 'GU', plan: { not: 'FREE' }, planExpiresAt: { lt: now } },
      select: { id: true, email: true, plan: true },
    });
    for (const u of expired) {
      await this.prisma.user.update({ where: { id: u.id }, data: { plan: 'FREE', planExpiresAt: null } });
      await this.cache.invalidateUserRole(u.id);
      await this.notify(u.id, u.email, {
        kind: 'PAYMENT',
        title: `Your ${u.plan} plan has expired`,
        body: 'Your account is now on the Free plan. Renew any time from Purchase Plan.',
        link: '/purchase-plan',
        dedupeKey: `plan-expired:${u.id}:${ymd(now)}`,
      });
    }
    return { downgraded: expired.length };
  }
}
