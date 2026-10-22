import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApplicationStatus, Prisma } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { IsId } from '../../common/validators';
import { buildChecklist, checklistProgress } from '../../common/checklist';
import { Keys, TTL, hashQuery } from '../../common/cache/cache-keys';
import { CacheService } from '../../common/cache/cache.service';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { PLANS } from '../../common/plans';
import { PrismaService } from '../../common/prisma/prisma.service';
import { requireStudent } from '../../common/student';

/** Field set of the "Add New Application" form. */
class ApplicationFieldsDto {
  @IsOptional() @IsEnum(ApplicationStatus) status?: ApplicationStatus;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() programType?: string;
  @IsOptional() @IsString() intakeTerm?: string;
  @IsOptional() @IsString() applicationRound?: string;
  @IsOptional() @IsDateString() appliedAt?: string;
  @IsOptional() @IsDateString() deadline?: string;
  @IsOptional() @IsDateString() expectedDecisionDate?: string;
  @IsOptional() @IsDateString() enrollmentDate?: string;
  @IsOptional() @IsDateString() interviewAt?: string;
  @IsOptional() @IsIn(['PAID', 'WAIVED', 'PENDING', 'NOT_REQUIRED']) feeStatus?: string;
  @IsOptional() @IsNumber() feeAmount?: number;
  @IsOptional() @IsString() applicationMethod?: string;
  @IsOptional() @IsBoolean() feeWaiverClaimed?: boolean;
  @IsOptional() @IsString() trackingReferenceId?: string;
  @IsOptional() @IsBoolean() officialTranscriptSubmitted?: boolean;
  @IsOptional() @IsBoolean() lor1Submitted?: boolean;
  @IsOptional() @IsBoolean() lor2Submitted?: boolean;
  @IsOptional() @IsBoolean() lor3Submitted?: boolean;
  @IsOptional() @IsBoolean() sopSubmitted?: boolean;
  @IsOptional() @IsBoolean() cvSubmitted?: boolean;
  @IsOptional() @IsBoolean() greSubmitted?: boolean;
  @IsOptional() @IsBoolean() ieltsSubmitted?: boolean;
  @IsOptional() @IsBoolean() toeflSubmitted?: boolean;
  @IsOptional() @IsString() notes?: string;
}

class CreateApplicationDto extends ApplicationFieldsDto {
  @IsId() programId: string;
}

class ListQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(ApplicationStatus) status?: ApplicationStatus;
  @IsOptional() @IsString() country?: string;
}

const DATE_FIELDS = ['appliedAt', 'deadline', 'expectedDecisionDate', 'enrollmentDate', 'interviewAt'] as const;
const PROGRAM_FIELDS = {
  id: true, programName: true, degreeLevel: true, deadlineDate: true, applicationFee: true, feeWaiverType: true,
  greRequired: true, ieltsRequirement: true, limitationsNotes: true, wesRequired: true, fundingLevel: true,
  university: { select: { id: true, name: true, location: true, country: true, wesRequired: true } },
} satisfies Prisma.ProgramSelect;

function withChecklist<A extends Parameters<typeof buildChecklist>[0] & { program: Parameters<typeof buildChecklist>[1] }>(a: A) {
  const checklist = buildChecklist(a, a.program);
  const { done, total } = checklistProgress(checklist);
  return { ...a, checklist, documentsComplete: done, documentsTotal: total };
}

function toData<T extends ApplicationFieldsDto>(dto: T) {
  const data: Record<string, unknown> = { ...(dto as Record<string, unknown>) };
  for (const f of DATE_FIELDS) if (dto[f]) data[f] = new Date(dto[f] as string);
  return data;
}

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService, private readonly cache: CacheService) {}

  /** Kanban: every application grouped by status + the KPI strip counts/percentages. */
  async board(user: AuthUser, q: ListQueryDto) {
    const studentId = requireStudent(user);
    const key = `${Keys.studentApplications(user.id)}:${hashQuery(q)}`;
    return this.cache.wrap(key, TTL.OUTREACH, async () => {
      const where: Prisma.ApplicationWhereInput = {
        studentId,
        ...(q.status && { status: q.status }),
        ...(q.country && { program: { university: { country: q.country } } }),
        ...(q.q && {
          OR: [
            { program: { programName: { contains: q.q, mode: 'insensitive' } } },
            { program: { university: { name: { contains: q.q, mode: 'insensitive' } } } },
          ],
        }),
      };
      const items = await this.prisma.application.findMany({
        where,
        orderBy: [{ deadline: { sort: 'asc', nulls: 'last' } }],
        include: { program: { select: PROGRAM_FIELDS } },
      });
      const statuses = Object.values(ApplicationStatus);
      const total = items.length || 1;
      const enriched = items.map(withChecklist);
      return {
        columns: statuses.map((s) => ({ status: s, items: enriched.filter((a) => a.status === s) })),
        counts: statuses.map((s) => {
          const n = items.filter((a) => a.status === s).length;
          return { status: s, count: n, percent: Math.round((n / total) * 100) };
        }),
        total: items.length,
      };
    });
  }

  async get(user: AuthUser, id: string) {
    const studentId = requireStudent(user);
    const a = await this.prisma.application.findFirst({
      where: { id, studentId },
      include: { program: { select: { ...PROGRAM_FIELDS, financialAidPolicy: true, feeWaiverInfo: true, greRequirement: true, catalogLink: true } } },
    });
    if (!a) throw new NotFoundException('Application not found');
    return withChecklist(a);
  }

  /** Enforces the plan cap (Free: 3, Starter: 20, Pro/Premium: unlimited). */
  async create(user: AuthUser, dto: CreateApplicationDto) {
    const studentId = requireStudent(user);
    const cap = PLANS[user.plan].maxApplications;
    if (cap !== null && user.role === 'GU') {
      const n = await this.prisma.application.count({ where: { studentId } });
      if (n >= cap) {
        throw new ForbiddenException({ code: 'PLAN_LIMIT', message: `Your ${user.plan} plan tracks up to ${cap} applications. Upgrade to add more.` });
      }
    }
    const a = await this.prisma.application
      .create({ data: { ...(toData(dto) as Prisma.ApplicationUncheckedCreateInput), studentId } })
      .catch((e: { code?: string }) => {
        if (e.code === 'P2002') throw new ConflictException({ code: 'DUPLICATE_APPLICATION', message: 'You already track an application for this program.' });
        if (e.code === 'P2003') throw new NotFoundException('Program not found');
        throw e;
      });
    await this.cache.invalidateStudent(user.id);
    return a;
  }

  async update(user: AuthUser, id: string, dto: ApplicationFieldsDto) {
    const studentId = requireStudent(user);
    const owned = await this.prisma.application.count({ where: { id, studentId } });
    if (!owned) throw new NotFoundException('Application not found');
    const data = toData(dto) as Prisma.ApplicationUncheckedUpdateInput;
    // Moving a card to SUBMITTED stamps the submission date if the user hasn't.
    if (dto.status === 'SUBMITTED' && !dto.appliedAt) {
      const cur = await this.prisma.application.findUnique({ where: { id }, select: { appliedAt: true } });
      if (!cur?.appliedAt) data.appliedAt = new Date();
    }
    const a = await this.prisma.application.update({ where: { id }, data });
    await this.cache.invalidateStudent(user.id);
    return a;
  }

  async remove(user: AuthUser, id: string) {
    const studentId = requireStudent(user);
    const { count } = await this.prisma.application.deleteMany({ where: { id, studentId } });
    if (!count) throw new NotFoundException('Application not found');
    await this.cache.invalidateStudent(user.id);
    return { ok: true };
  }
}

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly svc: ApplicationsService) {}

  @Get()
  board(@CurrentUser() u: AuthUser, @Query() q: ListQueryDto) {
    return this.svc.board(u, q);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u, id);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateApplicationDto) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ApplicationFieldsDto) {
    return this.svc.update(u, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }
}

@Module({ controllers: [ApplicationsController], providers: [ApplicationsService] })
export class ApplicationsModule {}
