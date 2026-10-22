import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { AuditService } from '../../common/audit/audit.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { deriveProgram } from '../../common/derive';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IsId } from '../../common/validators';

/**
 * Programs carry most of the application-relevant facts in the dataset
 * (fees, waivers, GRE/IELTS, funding, WES). Admins edit the text exactly as
 * published; the structured columns are re-derived on every write.
 */
export class CreateProgramDto {
  @IsId() universityId: string;
  @IsString() @MinLength(2) @MaxLength(200) programName: string;
  @IsIn(['MS', 'PhD', 'PostDoc']) degreeLevel: string;
  @IsOptional() @IsUrl({ require_protocol: true }) catalogLink?: string;
  @IsOptional() @IsString() @MaxLength(60) deadlineDate?: string;
  @IsOptional() @IsString() @MaxLength(40) applicationFee?: string;
  @IsOptional() @IsString() @MaxLength(60) feeWaiverType?: string;
  @IsOptional() @IsString() @MaxLength(500) feeWaiverInfo?: string;
  @IsOptional() @IsString() @MaxLength(200) greRequirement?: string;
  @IsOptional() @IsString() @MaxLength(200) ieltsRequirement?: string;
  @IsOptional() @IsString() @MaxLength(1000) financialAidPolicy?: string;
  @IsOptional() @IsString() @MaxLength(1000) limitationsNotes?: string;
}
export class UpdateProgramDto extends PartialType(OmitType(CreateProgramDto, ['universityId'] as const)) {}

@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
  ) {}

  list(universityId?: string) {
    return this.prisma.program.findMany({
      where: universityId ? { universityId } : {},
      orderBy: [{ university: { csRankPosition: { sort: 'asc', nulls: 'last' } } }, { programName: 'asc' }],
      include: { university: { select: { id: true, name: true, wesRequired: true } } },
    });
  }

  async get(id: string) {
    const p = await this.prisma.program.findUnique({ where: { id }, include: { university: { select: { id: true, name: true, location: true, wesRequired: true } } } });
    if (!p) throw new NotFoundException('Program not found');
    return p;
  }

  async create(dto: CreateProgramDto, admin: AuthUser) {
    const p = await this.prisma.program.create({ data: { ...dto, ...deriveProgram(dto) } });
    await this.audit.log(admin.id, 'PROGRAM_UPSERTED', 'PROGRAM', p.id, null, dto);
    await this.cache.invalidateUniversities();
    return p;
  }

  async update(id: string, dto: UpdateProgramDto, admin: AuthUser) {
    const before = await this.get(id);
    const merged = { ...before, ...dto };
    const p = await this.prisma.program.update({ where: { id }, data: { ...dto, ...deriveProgram(merged) } });
    await this.audit.log(admin.id, 'PROGRAM_UPSERTED', 'PROGRAM', id, before, dto);
    await this.cache.invalidateUniversities();
    return p;
  }

  async remove(id: string, admin: AuthUser) {
    const apps = await this.prisma.application.count({ where: { programId: id } });
    const before = await this.prisma.program.delete({ where: { id } });
    await this.audit.log(admin.id, 'PROGRAM_DELETED', 'PROGRAM', id, before, { deletedApplications: apps });
    await this.cache.invalidateUniversities();
    return { ok: true, deletedApplications: apps };
  }
}

@Controller('programs')
export class ProgramsController {
  constructor(private readonly svc: ProgramsService) {}

  @Get() list(@Query('universityId') universityId?: string) {
    return this.svc.list(universityId);
  }
  @Get(':id') get(@Param('id') id: string) {
    return this.svc.get(id);
  }
  @Roles('ADMIN', 'SUPER_ADMIN') @Post() create(@Body() dto: CreateProgramDto, @CurrentUser() u: AuthUser) {
    return this.svc.create(dto, u);
  }
  @Roles('ADMIN', 'SUPER_ADMIN') @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateProgramDto, @CurrentUser() u: AuthUser) {
    return this.svc.update(id, dto, u);
  }
  @Roles('ADMIN', 'SUPER_ADMIN') @Delete(':id') remove(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.remove(id, u);
  }
}

@Module({ controllers: [ProgramsController], providers: [ProgramsService] })
export class ProgramsModule {}
