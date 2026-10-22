import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma, SavedItemType } from '@prisma/client';
import { IsArray, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsId } from '../../common/validators';
import { Keys, TTL } from '../../common/cache/cache-keys';
import { CacheService } from '../../common/cache/cache.service';
import { AllowBeforeSetup, AuthUser, CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { requireStudent } from '../../common/student';
import { normalizeList } from '../../common/derive';

// =============================================================== Profile
class UpdateProfileDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsString() undergradInstitution?: string;
  @IsOptional() @IsString() undergradMajor?: string;
  @IsOptional() @IsInt() graduationYear?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10) cgpa?: number;
  @IsOptional() @IsNumber() cgpaScale?: number;
  @IsOptional() @IsInt() @Min(260) @Max(340) greScore?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(9) ieltsScore?: number;
  @IsOptional() @IsInt() @Min(0) @Max(120) toeflScore?: number;
  @IsOptional() @IsIn(['MS', 'PhD', 'PostDoc']) targetDegree?: string;
  @IsOptional() @IsIn(['FULLY_FUNDED', 'PARTIAL', 'SELF']) fundingPreference?: string;
  @IsOptional() @IsIn(['Fall', 'Spring', 'Summer']) targetIntake?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) preferredCountries?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) researchInterests?: string[];
  @IsOptional() @IsArray() publications?: unknown[];
  @IsOptional() @IsArray() experience?: unknown[];
}

// =============================================================== Saved items
class SaveDto {
  @IsEnum(SavedItemType) type: SavedItemType;
  @IsId() targetId: string;
}

@Injectable()
export class StudentService {
  constructor(private readonly prisma: PrismaService, private readonly cache: CacheService) {}

  getProfile(user: AuthUser) {
    return this.prisma.studentProfile.findUniqueOrThrow({ where: { id: requireStudent(user) } });
  }

  async updateProfile(user: AuthUser, dto: UpdateProfileDto) {
    const p = await this.prisma.studentProfile.update({
      where: { id: requireStudent(user) },
      data: {
        ...dto,
        ...(dto.preferredCountries && { preferredCountries: normalizeList(dto.preferredCountries) }),
        ...(dto.researchInterests && { researchInterests: normalizeList(dto.researchInterests) }),
      } as Prisma.StudentProfileUpdateInput,
    });
    await this.cache.invalidateStudent(user.id); // match scores / dashboard depend on profile
    return p;
  }

  /** Student Dashboard — cached 10 min under hs:student:<id>:dashboard. */
  dashboard(user: AuthUser) {
    const studentId = requireStudent(user);
    return this.cache.wrap(Keys.studentDashboard(user.id), TTL.DASHBOARD, async () => {
      const [savedUnis, savedProfs, emailsSent, replies, apps, byStatus, reminders, recent, upcomingDeadlines] = await Promise.all([
        this.prisma.savedItem.count({ where: { studentId, type: 'UNIVERSITY' } }),
        this.prisma.savedItem.count({ where: { studentId, type: 'PROFESSOR' } }),
        this.prisma.professorOutreach.count({ where: { studentId, emailSentTime: { not: null } } }),
        this.prisma.professorOutreach.count({ where: { studentId, replyReceivedTime: { not: null } } }),
        this.prisma.application.count({ where: { studentId } }),
        this.prisma.application.groupBy({ by: ['status'], where: { studentId }, _count: true }),
        this.prisma.professorOutreach.findMany({
          where: { studentId, replyStatus: 'MAILED', nextReminderAt: { not: null } },
          orderBy: { nextReminderAt: 'asc' },
          take: 5,
          select: { id: true, nextReminderAt: true, professor: { select: { name: true, photoUrl: true, university: { select: { name: true } } } } },
        }),
        this.prisma.professorOutreach.findMany({
          where: { studentId, emailSentTime: { not: null } },
          orderBy: { emailSentTime: 'desc' },
          take: 5,
          select: {
            id: true, subject: true, emailSentTime: true, replyStatus: true, nextReminderAt: true,
            professor: { select: { name: true, researchAreas: true, university: { select: { name: true } } } },
          },
        }),
        this.prisma.application.findMany({
          where: { studentId, deadline: { gte: new Date() }, status: { in: ['NOT_STARTED', 'PREPARING'] } },
          orderBy: { deadline: 'asc' },
          take: 5,
          select: { id: true, deadline: true, program: { select: { programName: true, university: { select: { name: true } } } } },
        }),
      ]);
      return {
        kpis: { savedUniversities: savedUnis, savedProfessors: savedProfs, emailsSent, repliesReceived: replies, applications: apps },
        applicationOverview: byStatus.map((s) => ({ status: s.status, count: s._count })),
        remindersDue: reminders.map((r) => ({
          ...r,
          dueInDays: r.nextReminderAt ? Math.ceil((r.nextReminderAt.getTime() - Date.now()) / 86_400_000) : null,
        })),
        recentEmails: recent,
        upcomingDeadlines,
      };
    });
  }

  async listSaved(user: AuthUser, type?: SavedItemType) {
    const studentId = requireStudent(user);
    const rows = await this.prisma.savedItem.findMany({ where: { studentId, ...(type && { type }) }, orderBy: { createdAt: 'desc' } });
    const ids = (t: SavedItemType) => rows.filter((r) => r.type === t).map((r) => r.targetId);
    const [unis, profs, programs] = await Promise.all([
      this.prisma.university.findMany({ where: { id: { in: ids('UNIVERSITY') } } }),
      this.prisma.professor.findMany({
        where: { id: { in: ids('PROFESSOR') } },
        select: { id: true, name: true, title: true, photoUrl: true, researchAreas: true, acceptingStudents: true, university: { select: { name: true } } },
      }),
      this.prisma.program.findMany({ where: { id: { in: ids('PROGRAM') } }, include: { university: { select: { name: true } } } }),
    ]);
    return { universities: unis, professors: profs, programs };
  }

  async save(user: AuthUser, dto: SaveDto) {
    const studentId = requireStudent(user);
    await this.prisma.savedItem.upsert({
      where: { studentId_type_targetId: { studentId, ...dto } },
      update: {},
      create: { studentId, ...dto },
    });
    await this.cache.del(Keys.studentDashboard(user.id));
    return { saved: true };
  }

  async unsave(user: AuthUser, type: SavedItemType, targetId: string) {
    const studentId = requireStudent(user);
    await this.prisma.savedItem.deleteMany({ where: { studentId, type, targetId } });
    await this.cache.del(Keys.studentDashboard(user.id));
    return { saved: false };
  }

  // ---- notifications (bell)
  notifications(user: AuthUser) {
    return this.prisma.notification.findMany({ where: { userId: user.id, channel: 'IN_APP' }, orderBy: { createdAt: 'desc' }, take: 30 });
  }
  async markRead(user: AuthUser, id?: string) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null, ...(id && { id }) }, data: { readAt: new Date() } });
    return { ok: true };
  }
}

@Controller()
export class StudentController {
  constructor(private readonly svc: StudentService) {}

  @AllowBeforeSetup() @Get('profile') getProfile(@CurrentUser() u: AuthUser) {
    return this.svc.getProfile(u);
  }
  @AllowBeforeSetup() @Patch('profile') updateProfile(@CurrentUser() u: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.svc.updateProfile(u, dto);
  }
  @Get('dashboard') dashboard(@CurrentUser() u: AuthUser) {
    return this.svc.dashboard(u);
  }
  @Get('saved') listSaved(@CurrentUser() u: AuthUser, @Query('type') type?: SavedItemType) {
    return this.svc.listSaved(u, type);
  }
  @Post('saved') save(@CurrentUser() u: AuthUser, @Body() dto: SaveDto) {
    return this.svc.save(u, dto);
  }
  @Delete('saved/:type/:targetId') unsave(@CurrentUser() u: AuthUser, @Param('type') type: SavedItemType, @Param('targetId') id: string) {
    return this.svc.unsave(u, type, id);
  }
  @AllowBeforeSetup() @Get('notifications') notifications(@CurrentUser() u: AuthUser) {
    return this.svc.notifications(u);
  }
  @AllowBeforeSetup() @HttpCode(200) @Post('notifications/read') readAll(@CurrentUser() u: AuthUser) {
    return this.svc.markRead(u);
  }
  @AllowBeforeSetup() @HttpCode(200) @Post('notifications/:id/read') readOne(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.markRead(u, id);
  }
}

@Module({ controllers: [StudentController], providers: [StudentService] })
export class StudentModule {}
