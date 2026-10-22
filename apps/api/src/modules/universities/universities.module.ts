import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { Prisma } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuditService } from '../../common/audit/audit.service';
import { Keys, TTL, hashQuery } from '../../common/cache/cache-keys';
import { CacheService } from '../../common/cache/cache.service';
import { AuthUser, CurrentUser, Roles, AllowBeforeSetup } from '../../common/decorators';
import { deriveUniversity, MatchProfile, normTag, universityMatch } from '../../common/derive';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginate } from '../../common/student';

const toArray = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Array.isArray(value) ? value : String(value).split(',').filter(Boolean);
const toBool = ({ value }: { value: unknown }) => (value === undefined || value === '' ? undefined : value === true || value === 'true');

/** Filters map 1:1 to columns the dataset has (or derives) — see docs/DATA_NOTES.md. */
export class UniversityQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string; // name or location
  @IsOptional() @Transform(toArray) @IsArray() states?: string[]; // ["PA","TX"]
  @IsOptional() @Transform(toArray) @IsArray() countries?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxRank?: number; // csRankPosition ≤
  @IsOptional() @Transform(toBool) @IsBoolean() wes?: boolean; // false = hide WES-required
  @IsOptional() @IsIn(['MS', 'PhD', 'PostDoc']) degreeLevel?: string; // has a program at this level
  @IsOptional() @IsIn(['GUARANTEED', 'AVAILABLE']) funding?: string; // AVAILABLE also matches GUARANTEED
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxFee?: number; // some program's fee ≤ (USD)
  @IsOptional() @Transform(toBool) @IsBoolean() feeWaiver?: boolean; // some program offers a waiver route
  @IsOptional() @IsString() @MaxLength(80) researchArea?: string; // a professor there works on this
  @IsOptional() @Transform(toBool) @IsBoolean() hasFaculty?: boolean;
  @IsOptional() @IsIn(['match', 'rank', 'name', 'fee']) sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class UpsertUniversityDto {
  @IsString() @MinLength(2) name: string;
  @IsString() @MinLength(2) location: string; // "City, ST" — state/country are derived
  @IsOptional() @IsString() csRank?: string; // "#12 in Computer Science (tie)" — position is derived
  @IsOptional() @IsBoolean() wesRequired?: boolean;
}
export class UpdateUniversityDto extends PartialType(UpsertUniversityDto) {}

const PROGRAM_SUMMARY = {
  id: true, programName: true, degreeLevel: true, deadlineDate: true, applicationFee: true, applicationFeeUsd: true,
  feeWaiverType: true, greRequirement: true, greRequired: true, ieltsRequirement: true, ieltsMinOverall: true,
  fundingLevel: true, wesRequired: true,
} satisfies Prisma.ProgramSelect;

type UniRow = Prisma.UniversityGetPayload<{
  include: { programs: { select: typeof PROGRAM_SUMMARY }; _count: { select: { professors: true; programs: true } } };
}> & { researchAreas: string[] };

@Injectable()
export class UniversitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The filtered list (all pages, user-independent) is cached under one key,
   * then match scores are added for the caller and the list is sorted and paged
   * in memory — so "sort by match" ranks across every result, not just one page.
   * University counts are in the hundreds, which keeps this cheap.
   */
  private async filtered(q: UniversityQueryDto): Promise<UniRow[]> {
    const { sort: _s, page: _p, pageSize: _ps, ...filters } = q;
    return this.cache.wrap(Keys.univSearch(hashQuery(filters)), TTL.DIRECTORY, async () => {
      const and: Prisma.UniversityWhereInput[] = [];
      if (q.q) and.push({ OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { location: { contains: q.q, mode: 'insensitive' } }] });
      if (q.states?.length) and.push({ state: { in: q.states.map((s) => s.toUpperCase()) } });
      if (q.countries?.length) and.push({ country: { in: q.countries } });
      if (q.maxRank) and.push({ csRankPosition: { lte: q.maxRank } });
      if (q.wes === false) and.push({ wesRequired: false, programs: { none: { wesRequired: true } } });
      if (q.hasFaculty) and.push({ professors: { some: {} } });
      const prog: Prisma.ProgramWhereInput = {
        ...(q.degreeLevel && { degreeLevel: q.degreeLevel }),
        ...(q.funding === 'GUARANTEED' && { fundingLevel: 'GUARANTEED' }),
        ...(q.funding === 'AVAILABLE' && { fundingLevel: { in: ['GUARANTEED', 'AVAILABLE'] } }),
        ...(q.maxFee != null && { applicationFeeUsd: { lte: q.maxFee } }),
        ...(q.feeWaiver && { OR: [{ applicationFeeUsd: 0 }, { feeWaiverType: { not: null, notIn: ['None', 'none'] } }] }),
      };
      if (Object.keys(prog).length) and.push({ programs: { some: prog } });
      if (q.researchArea) {
        const ids = await this.prisma.$queryRaw<{ universityId: string }[]>`
          SELECT DISTINCT "universityId" FROM "Professor"
          WHERE ${normTag(q.researchArea)} = ANY(hs_norm_array("researchAreas"))`;
        and.push({ id: { in: ids.map((r) => r.universityId) } });
      }

      const rows = await this.prisma.university.findMany({
        where: and.length ? { AND: and } : {},
        orderBy: [{ csRankPosition: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
        include: { programs: { select: PROGRAM_SUMMARY, orderBy: { degreeLevel: 'asc' } }, _count: { select: { professors: true, programs: true } } },
      });
      const areas = await this.prisma.$queryRaw<{ universityId: string; areas: string[] }[]>`
        SELECT "universityId", array_agg(DISTINCT a ORDER BY a) AS areas
        FROM "Professor", unnest("researchAreas") a GROUP BY "universityId"`;
      const byUni = new Map(areas.map((r) => [r.universityId, r.areas]));
      return rows.map((u) => ({ ...u, researchAreas: byUni.get(u.id) ?? [] }));
    });
  }

  private async profile(user: AuthUser): Promise<MatchProfile | null> {
    if (!user.studentProfileId) return null;
    return this.prisma.studentProfile.findUnique({
      where: { id: user.studentProfileId },
      select: { targetDegree: true, fundingPreference: true, preferredCountries: true, researchInterests: true, greScore: true, ieltsScore: true },
    });
  }

  async search(q: UniversityQueryDto, user: AuthUser) {
    const { skip, take, page, pageSize } = paginate(q.page, q.pageSize ?? 10);
    const [rows, profile, savedRows] = await Promise.all([
      this.filtered(q),
      this.profile(user),
      user.studentProfileId
        ? this.prisma.savedItem.findMany({ where: { studentId: user.studentProfileId, type: 'UNIVERSITY' }, select: { targetId: true } })
        : [],
    ]);
    const saved = new Set(savedRows.map((s) => s.targetId));
    const sort = q.sort ?? (profile ? 'match' : 'rank');

    let items = rows.map((u) => ({ ...u, match: profile ? universityMatch(profile, u) : null, saved: saved.has(u.id) }));
    const minFee = (u: UniRow) => Math.min(...u.programs.map((p) => p.applicationFeeUsd ?? Infinity));
    const rank = (u: UniRow) => u.csRankPosition ?? Infinity;
    if (sort === 'match') items.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0) || rank(a) - rank(b));
    else if (sort === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'fee') items.sort((a, b) => minFee(a) - minFee(b) || rank(a) - rank(b));
    // 'rank' is the cached order already
    items = items.slice(skip, skip + take);
    return { items, total: rows.length, page, pageSize, sort };
  }

  /** Counts for the filter panel. */
  facets() {
    return this.cache.wrap(`${Keys.univAll()}:facets`, TTL.DIRECTORY, async () => {
      const [states, degree, funding, areas, wes] = await Promise.all([
        this.prisma.university.groupBy({ by: ['state'], _count: true, orderBy: { state: 'asc' } }),
        this.prisma.$queryRaw<{ k: string; n: bigint }[]>`SELECT "degreeLevel" k, count(DISTINCT "universityId") n FROM "Program" GROUP BY 1 ORDER BY 1`,
        this.prisma.$queryRaw<{ k: string; n: bigint }[]>`SELECT "fundingLevel" k, count(DISTINCT "universityId") n FROM "Program" WHERE "fundingLevel" IS NOT NULL GROUP BY 1`,
        this.prisma.$queryRaw<{ k: string; n: bigint }[]>`
          SELECT min(a) k, count(DISTINCT "universityId") n FROM "Professor", unnest("researchAreas") a
          GROUP BY hs_norm_tag(a) ORDER BY 2 DESC, 1 LIMIT 40`,
        this.prisma.university.count({ where: { wesRequired: true } }),
      ]);
      const fmt = (r: { k: string; n: bigint }[]) => r.map((x) => ({ key: x.k, count: Number(x.n) }));
      return {
        states: states.filter((s) => s.state).map((s) => ({ key: s.state!, count: s._count })),
        degreeLevels: fmt(degree),
        fundingLevels: fmt(funding),
        researchAreas: fmt(areas),
        wesRequired: wes,
      };
    });
  }

  async get(id: string, user: AuthUser) {
    const u = await this.cache.wrap(Keys.univ(id), TTL.DIRECTORY, () =>
      this.prisma.university.findUnique({ where: { id }, include: { programs: { orderBy: { degreeLevel: 'asc' } }, _count: { select: { professors: true } } } }),
    );
    if (!u) throw new NotFoundException('University not found');
    const [profile, list] = await Promise.all([this.profile(user), this.filtered({ q: undefined })]);
    const row = list.find((x) => x.id === id);
    return { ...u, researchAreas: row?.researchAreas ?? [], match: profile && row ? universityMatch(profile, row) : null };
  }

  /** Header stats on "Professors at <University>". */
  stats(id: string) {
    return this.cache.wrap(`${Keys.univ(id)}:stats`, TTL.PROFESSOR, async () => {
      const [total, depts, accepting, areas, programs] = await Promise.all([
        this.prisma.professor.count({ where: { universityId: id } }),
        this.prisma.professor.findMany({ where: { universityId: id, department: { not: null } }, distinct: ['department'], select: { department: true } }),
        this.prisma.professor.count({ where: { universityId: id, acceptingStudents: true } }),
        this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(DISTINCT hs_norm_tag(a)) AS n FROM "Professor", unnest("researchAreas") a WHERE "universityId" = ${id}`,
        this.prisma.program.count({ where: { universityId: id } }),
      ]);
      return { totalProfessors: total, departments: depts.length, researchAreas: Number(areas[0]?.n ?? 0), acceptingStudents: accepting, programs };
    });
  }

  async create(dto: UpsertUniversityDto, admin: AuthUser) {
    const u = await this.prisma.university.create({ data: { ...dto, ...deriveUniversity(dto) } });
    await this.audit.log(admin.id, 'UNIVERSITY_UPSERTED', 'UNIVERSITY', u.id, null, dto);
    await this.cache.invalidateUniversities();
    return u;
  }

  async update(id: string, dto: UpdateUniversityDto, admin: AuthUser) {
    const before = await this.prisma.university.findUniqueOrThrow({ where: { id } });
    const merged = { location: dto.location ?? before.location, csRank: dto.csRank !== undefined ? dto.csRank : before.csRank };
    const u = await this.prisma.university.update({ where: { id }, data: { ...dto, ...deriveUniversity(merged) } });
    await this.audit.log(admin.id, 'UNIVERSITY_UPSERTED', 'UNIVERSITY', id, before, dto);
    await Promise.all([this.cache.invalidateUniversities(), this.cache.invalidateProfessors()]);
    return u;
  }

  async remove(id: string, admin: AuthUser) {
    const before = await this.prisma.university.delete({ where: { id } });
    await this.audit.log(admin.id, 'UNIVERSITY_DELETED', 'UNIVERSITY', id, before, null);
    await Promise.all([this.cache.invalidateUniversities(), this.cache.invalidateProfessors()]);
    return { ok: true };
  }
}

@Controller('universities')
export class UniversitiesController {
  constructor(private readonly svc: UniversitiesService) {}

  @Get() search(@Query() q: UniversityQueryDto, @CurrentUser() u: AuthUser) {
    return this.svc.search(q, u);
  }
  // The setup form suggests countries and research areas from the directory.
  @AllowBeforeSetup() @Get('facets') facets() {
    return this.svc.facets();
  }
  @Get(':id') get(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.get(id, u);
  }
  @Get(':id/stats') stats(@Param('id') id: string) {
    return this.svc.stats(id);
  }

  // ---- Directory management (Admin) — read-only for GU per the RBAC matrix
  @Roles('ADMIN', 'SUPER_ADMIN') @Post() create(@Body() dto: UpsertUniversityDto, @CurrentUser() u: AuthUser) {
    return this.svc.create(dto, u);
  }
  @Roles('ADMIN', 'SUPER_ADMIN') @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateUniversityDto, @CurrentUser() u: AuthUser) {
    return this.svc.update(id, dto, u);
  }
  @Roles('ADMIN', 'SUPER_ADMIN') @Delete(':id') remove(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.remove(id, u);
  }
}

@Module({ controllers: [UniversitiesController], providers: [UniversitiesService], exports: [UniversitiesService] })
export class UniversitiesModule {}
