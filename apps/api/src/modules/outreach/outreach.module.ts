import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OutreachEventType, Prisma, ReplyStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { IsId } from '../../common/validators';
import { Keys, TTL, hashQuery } from '../../common/cache/cache-keys';
import { CacheService } from '../../common/cache/cache.service';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginate, requireStudent } from '../../common/student';

export const FOLLOW_UP_DAYS = 7;

class OutreachQueryDto {
  @IsOptional() @IsEnum(ReplyStatus) status?: ReplyStatus;
  @IsOptional() @IsIn(['REMINDER_DUE']) view?: string;
  @IsOptional() @IsId() universityId?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(['7d', '30d', '90d', 'all']) range?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

class CreateOutreachDto {
  @IsId() professorId: string;
  @IsOptional() @IsString() subject?: string;
  /** If set, the thread starts as MAILED with an INITIAL_SENT event. */
  @IsOptional() @IsDateString() emailSentTime?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() attachedCvUrl?: string;
  @IsOptional() @IsString() attachedProposalUrl?: string;
}

class UpdateOutreachDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsEnum(ReplyStatus) replyStatus?: ReplyStatus;
  @IsOptional() @IsString() professorReplyNotes?: string;
  @IsOptional() @IsString() fundingStatus?: string;
  @IsOptional() @IsString() interviewStatus?: string;
  @IsOptional() @IsDateString() nextReminderAt?: string;
  @IsOptional() @IsString() attachedCvUrl?: string;
  @IsOptional() @IsString() attachedProposalUrl?: string;
}

/** Log something that happened in the thread; denormalized fields follow. */
class AddEventDto {
  @IsEnum(OutreachEventType) type: OutreachEventType;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsString() note?: string;
}

const days = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

@Injectable()
export class OutreachService {
  constructor(private readonly prisma: PrismaService, private readonly cache: CacheService) {}

  private async own(id: string, studentId: string) {
    const o = await this.prisma.professorOutreach.findFirst({ where: { id, studentId } });
    if (!o) throw new NotFoundException('Outreach not found');
    return o;
  }

  /** Table + KPI cards on the Professor Mailing Tracker. Cached 5 min per user+query. */
  async list(user: AuthUser, q: OutreachQueryDto) {
    const studentId = requireStudent(user);
    const { skip, take, page, pageSize } = paginate(q.page, q.pageSize ?? 10);
    const key = `${Keys.studentOutreach(user.id)}:${hashQuery({ ...q, page, pageSize })}`;

    return this.cache.wrap(key, TTL.OUTREACH, async () => {
      const since = q.range && q.range !== 'all' ? days(new Date(), -Number(q.range.replace('d', ''))) : undefined;
      const where: Prisma.ProfessorOutreachWhereInput = {
        studentId,
        ...(q.status && { replyStatus: q.status }),
        ...(q.view === 'REMINDER_DUE' && { replyStatus: 'MAILED', nextReminderAt: { lte: days(new Date(), FOLLOW_UP_DAYS) } }),
        ...(q.universityId && { professor: { universityId: q.universityId } }),
        ...(since && { emailSentTime: { gte: since } }),
        ...(q.q && {
          OR: [
            { professor: { name: { contains: q.q, mode: 'insensitive' } } },
            { professor: { university: { name: { contains: q.q, mode: 'insensitive' } } } },
            { professor: { email: { contains: q.q, mode: 'insensitive' } } },
          ],
        }),
      };
      const [items, total] = await this.prisma.$transaction([
        this.prisma.professorOutreach.findMany({
          where,
          orderBy: [{ emailSentTime: { sort: 'desc', nulls: 'first' } }],
          skip,
          take,
          include: {
            professor: { select: { id: true, name: true, title: true, email: true, photoUrl: true, university: { select: { id: true, name: true } } } },
          },
        }),
        this.prisma.professorOutreach.count({ where }),
      ]);
      return { items: items.map((o) => ({ ...o, reminderDue: this.isReminderDue(o) })), total, page, pageSize, stats: await this.stats(studentId) };
    });
  }

  /** Same rule as the worker: the scheduled date, or 7 days after sending when none was set. */
  private isReminderDue(o: { replyStatus: ReplyStatus; nextReminderAt: Date | null; emailSentTime: Date | null }) {
    if (o.replyStatus !== 'MAILED') return false;
    const due = o.nextReminderAt ?? (o.emailSentTime && days(o.emailSentTime, FOLLOW_UP_DAYS));
    return !!due && due.getTime() <= Date.now();
  }

  async stats(studentId: string) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [byStatus, sentThisMonth, remindersNext7, interviewsThisMonth, applications] = await Promise.all([
      this.prisma.professorOutreach.groupBy({ by: ['replyStatus'], where: { studentId }, _count: true }),
      this.prisma.professorOutreach.count({ where: { studentId, emailSentTime: { gte: monthStart } } }),
      this.prisma.professorOutreach.count({ where: { studentId, replyStatus: 'MAILED', nextReminderAt: { lte: days(new Date(), FOLLOW_UP_DAYS) } } }),
      this.prisma.outreachEvent.count({ where: { type: 'INTERVIEW_SCHEDULED', occurredAt: { gte: monthStart }, outreach: { studentId } } }),
      this.prisma.application.count({ where: { studentId, status: { notIn: ['NOT_STARTED', 'PREPARING'] } } }),
    ]);
    const c = (s: ReplyStatus) => byStatus.find((b) => b.replyStatus === s)?._count ?? 0;
    const total = byStatus.reduce((n, b) => n + b._count, 0);
    const positive = c('POSITIVE_REPLY') + c('INTERVIEW');
    return {
      totalProfessors: total,
      emailsSentThisMonth: sentThisMonth,
      repliesReceived: positive + c('DECLINED'),
      positiveReplies: positive,
      negativeReplies: c('DECLINED'),
      pendingReminders: remindersNext7,
      interviewsThisMonth,
      applicationsSubmitted: applications,
    };
  }

  /** Detail view: profile header, Email Timeline (thread), notes, attachments. */
  async get(user: AuthUser, id: string) {
    const studentId = requireStudent(user);
    const o = await this.prisma.professorOutreach.findFirst({
      where: { id, studentId },
      include: {
        events: { orderBy: { occurredAt: 'asc' } },
        professor: { include: { university: { select: { id: true, name: true, location: true } } } },
      },
    });
    if (!o) throw new NotFoundException('Outreach not found');
    const { searchVector: _sv, ...professor } = o.professor as typeof o.professor & { searchVector?: unknown };
    return { ...o, professor, reminderDue: this.isReminderDue(o) };
  }

  async create(user: AuthUser, dto: CreateOutreachDto) {
    const studentId = requireStudent(user);
    const sentAt = dto.emailSentTime ? new Date(dto.emailSentTime) : null;
    const o = await this.prisma.professorOutreach.create({
      data: {
        studentId,
        professorId: dto.professorId,
        subject: dto.subject,
        professorReplyNotes: dto.notes,
        attachedCvUrl: dto.attachedCvUrl,
        attachedProposalUrl: dto.attachedProposalUrl,
        emailSentTime: sentAt,
        replyStatus: sentAt ? 'MAILED' : 'NOT_SENT',
        nextReminderAt: sentAt ? days(sentAt, FOLLOW_UP_DAYS) : null,
        events: sentAt ? { create: { type: 'INITIAL_SENT', occurredAt: sentAt } } : undefined,
      },
    });
    await this.cache.invalidateStudent(user.id);
    return o;
  }

  async update(user: AuthUser, id: string, dto: UpdateOutreachDto) {
    const studentId = requireStudent(user);
    const cur = await this.own(id, studentId);
    const statusChanged = dto.replyStatus && dto.replyStatus !== cur.replyStatus;
    const o = await this.prisma.professorOutreach.update({
      where: { id },
      data: {
        ...dto,
        nextReminderAt: dto.nextReminderAt ? new Date(dto.nextReminderAt) : dto.replyStatus && dto.replyStatus !== 'MAILED' ? null : undefined,
        events: statusChanged ? { create: { type: 'STATUS_CHANGED', meta: { from: cur.replyStatus, to: dto.replyStatus } } } : undefined,
      },
    });
    await this.cache.invalidateStudent(user.id);
    return o;
  }

  /**
   * Append to the thread and keep the row's denormalized columns in sync:
   *   INITIAL_SENT        → MAILED, emailSentTime, nextReminderAt = +7d
   *   REMINDER_SENT       → reminderSentTime, nextReminderAt = +7d
   *   REPLY_RECEIVED      → POSITIVE_REPLY (unless already further), replyReceivedTime, no more reminders
   *   INTERVIEW_SCHEDULED → INTERVIEW, interviewAt
   */
  async addEvent(user: AuthUser, id: string, dto: AddEventDto) {
    const studentId = requireStudent(user);
    const cur = await this.own(id, studentId);
    const at = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const patch: Prisma.ProfessorOutreachUpdateInput = {};
    switch (dto.type) {
      case 'INITIAL_SENT':
        Object.assign(patch, { replyStatus: 'MAILED', emailSentTime: at, nextReminderAt: days(at, FOLLOW_UP_DAYS) });
        break;
      case 'REMINDER_SENT':
        Object.assign(patch, { reminderSentTime: at, nextReminderAt: days(at, FOLLOW_UP_DAYS) });
        break;
      case 'REPLY_RECEIVED':
        Object.assign(patch, {
          replyReceivedTime: at,
          nextReminderAt: null,
          replyStatus: cur.replyStatus === 'INTERVIEW' ? 'INTERVIEW' : 'POSITIVE_REPLY',
        });
        break;
      case 'INTERVIEW_SCHEDULED':
        Object.assign(patch, { replyStatus: 'INTERVIEW', interviewAt: at, nextReminderAt: null });
        break;
      case 'NOTE':
        if (dto.note) patch.professorReplyNotes = dto.note;
        break;
    }
    const [event] = await this.prisma.$transaction([
      this.prisma.outreachEvent.create({ data: { outreachId: id, type: dto.type, occurredAt: at, note: dto.note } }),
      this.prisma.professorOutreach.update({ where: { id }, data: patch }),
    ]);
    await this.cache.invalidateStudent(user.id);
    return event;
  }

  async remove(user: AuthUser, id: string) {
    const studentId = requireStudent(user);
    await this.own(id, studentId);
    await this.prisma.professorOutreach.delete({ where: { id } });
    await this.cache.invalidateStudent(user.id);
    return { ok: true };
  }

  /** CSV export of the tracker (Export button). */
  async exportCsv(user: AuthUser) {
    const studentId = requireStudent(user);
    const rows = await this.prisma.professorOutreach.findMany({
      where: { studentId },
      include: { professor: { select: { name: true, email: true, university: { select: { name: true } } } } },
      orderBy: { emailSentTime: 'desc' },
    });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Professor', 'University', 'Email', 'Mail Sent', 'Reminder', 'Reply Received', 'Status', 'Notes'];
    const lines = rows.map((r) =>
      [r.professor.name, r.professor.university.name, r.professor.email, r.emailSentTime?.toISOString(), r.reminderSentTime?.toISOString(), r.replyReceivedTime?.toISOString(), r.replyStatus, r.professorReplyNotes]
        .map(esc)
        .join(','),
    );
    return [head.join(','), ...lines].join('\n');
  }
}

@Controller('outreach')
export class OutreachController {
  constructor(private readonly svc: OutreachService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: OutreachQueryDto) {
    return this.svc.list(u, q);
  }

  @Get('export.csv')
  async export(@CurrentUser() u: AuthUser) {
    return { filename: 'outreach.csv', csv: await this.svc.exportCsv(u) };
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u, id);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateOutreachDto) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateOutreachDto) {
    return this.svc.update(u, id, dto);
  }

  @Post(':id/events')
  addEvent(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AddEventDto) {
    return this.svc.addEvent(u, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }
}

@Module({ controllers: [OutreachController], providers: [OutreachService], exports: [OutreachService] })
export class OutreachModule {}
