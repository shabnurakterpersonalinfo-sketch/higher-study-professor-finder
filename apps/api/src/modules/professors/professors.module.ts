import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { Prisma } from '@prisma/client';
import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuditService } from '../../common/audit/audit.service';
import { Keys, TTL, hashQuery } from '../../common/cache/cache-keys';
import { CacheService } from '../../common/cache/cache.service';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { matchedAreas, normTag, stripHonorific, normalizeList } from '../../common/derive';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginate } from '../../common/student';
import { IsId } from '../../common/validators';

export class ProfessorSearchDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  /** Matched with normalisation: "cybersecurity" finds "Cyber Security". */
  @IsOptional() @IsArray() @IsString({ each: true }) researchAreas?: string[];
  @IsOptional() @IsId() universityId?: string;
  @IsOptional() @IsString() @MaxLength(100) department?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) academicRanks?: string[];
  @IsOptional() @IsArray() @IsIn(['PhD', 'Postdoc', 'RA'], { each: true }) openings?: string[];
  @IsOptional() @IsBoolean() acceptingStudents?: boolean;
  @IsOptional() @IsInt() @Min(0) minHIndex?: number;
  @IsOptional() @IsInt() @Min(0) minCitations?: number;
  /** fit = overlap with the caller's research interests (falls back to relevance with no profile). */
  @IsOptional() @IsIn(['fit', 'relevance', 'hIndex', 'citations', 'name']) sort?: string;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class UpsertProfessorDto {
  @IsId() universityId: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsIn(['Professor', 'Associate Professor', 'Assistant Professor', 'Lecturer', 'Research Scientist']) academicRank?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(160) department?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) photoUrl?: string;
  @IsOptional() @IsString() @MaxLength(4000) bio?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) profileLink?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) googleScholarLink?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) labWebsite?: string;
  @IsOptional() @IsInt() @Min(0) hIndex?: number;
  @IsOptional() @IsInt() @Min(0) citationCount?: number;
  @IsOptional() @IsBoolean() acceptingStudents?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) researchAreas?: string[];
  @IsOptional() @IsArray() openPositions?: unknown[];
}
export class UpdateProfessorDto extends PartialType(UpsertProfessorDto) {}

/** Columns returned by search — never `searchVector` (Unsupported type). */
const COLS = Prisma.sql`p."id", p."universityId", p."name", p."title", p."academicRank", p."email", p."department",
  p."photoUrl", p."hIndex", p."citationCount", p."acceptingStudents", p."researchAreas", p."openPositions",
  u."name" AS "universityName", u."location" AS "universityLocation", u."csRank" AS "universityCsRank"`;

/** Platform-wide outreach stats are only shown once enough threads exist that no single student is identifiable. */
const MIN_THREADS_FOR_STATS = 3;

@Injectable()
export class ProfessorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
  ) {}

  private async interests(user: AuthUser): Promise<string[]> {
    if (!user.studentProfileId) return [];
    const p = await this.prisma.studentProfile.findUnique({ where: { id: user.studentProfileId }, select: { researchInterests: true } });
    return p?.researchInterests ?? [];
  }

  /**
   * Full-text + fuzzy + tag search.
   *  - `q`            → tsvector @@ websearch_to_tsquery, or trigram ILIKE on name/department
   *  - `researchAreas`→ hs_norm_array(...) && normalised tags (GIN index)
   *  - sort `fit`     → number of areas shared with the caller's interests
   * Pages are cached under hs:prof:search:<hash>. For `fit` the caller's normalised
   * interests are part of the hash, so students with the same interests share entries.
   */
  async search(dto: ProfessorSearchDto, user: AuthUser) {
    const { skip, take, page, pageSize } = paginate(dto.page, dto.pageSize);
    const interests = await this.interests(user);
    const normInterests = [...new Set(interests.map(normTag).filter(Boolean))].sort();
    const sort = dto.sort ?? (dto.q ? 'relevance' : normInterests.length ? 'fit' : 'name');
    const fitInputs = sort === 'fit' ? normInterests : [];
    const key = Keys.profSearch(hashQuery({ ...dto, sort, fitInputs, page, pageSize }));

    const result = await this.cache.wrap(key, TTL.PROFESSOR, async () => {
      const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
      const q = dto.q?.trim();
      if (q) {
        where.push(Prisma.sql`(p."searchVector" @@ websearch_to_tsquery('english', ${q})
          OR p."name" ILIKE ${'%' + q + '%'} OR p."department" ILIKE ${'%' + q + '%'})`);
      }
      if (dto.researchAreas?.length) {
        where.push(Prisma.sql`hs_norm_array(p."researchAreas") && ${dto.researchAreas.map(normTag)}::text[]`);
      }
      if (dto.universityId) where.push(Prisma.sql`p."universityId" = ${dto.universityId}`);
      if (dto.acceptingStudents !== undefined) where.push(Prisma.sql`p."acceptingStudents" = ${dto.acceptingStudents}`);
      if (dto.department) where.push(Prisma.sql`p."department" ILIKE ${'%' + dto.department + '%'}`);
      if (dto.academicRanks?.length) where.push(Prisma.sql`p."academicRank" = ANY(${dto.academicRanks}::text[])`);
      if (dto.minHIndex) where.push(Prisma.sql`p."hIndex" >= ${dto.minHIndex}`);
      if (dto.minCitations) where.push(Prisma.sql`p."citationCount" >= ${dto.minCitations}`);
      if (dto.openings?.length) {
        const ors = dto.openings.map((t) => Prisma.sql`p."openPositions" @> ${JSON.stringify([{ type: t }])}::jsonb`);
        where.push(Prisma.sql`(${Prisma.join(ors, ' OR ')})`);
      }
      const whereSql = Prisma.join(where, ' AND ');

      const relevance = q
        ? // Name similarity only counts above pg_trgm's 0.3 threshold, so incidental
          // trigram overlap doesn't outrank genuine topic matches.
          Prisma.sql`ts_rank(p."searchVector", websearch_to_tsquery('english', ${q})) + GREATEST(similarity(p."name", ${q}) - 0.3, 0) * 2`
        : Prisma.sql`0`;
      const fit = fitInputs.length
        ? Prisma.sql`(SELECT count(*) FROM unnest(hs_norm_array(p."researchAreas")) a WHERE a = ANY(${fitInputs}::text[]))`
        : Prisma.sql`0`;
      const order =
        sort === 'hIndex'
          ? Prisma.sql`p."hIndex" DESC NULLS LAST, p."name"`
          : sort === 'citations'
            ? Prisma.sql`p."citationCount" DESC NULLS LAST, p."name"`
            : sort === 'name'
              ? Prisma.sql`p."name"`
              : sort === 'fit'
                ? Prisma.sql`fit DESC, u."csRankPosition" ASC NULLS LAST, p."name"`
                : Prisma.sql`score DESC, fit DESC, p."name"`;

      const [items, count] = await Promise.all([
        this.prisma.$queryRaw<(Record<string, unknown> & { researchAreas: string[]; score: unknown; fit: unknown })[]>`
          SELECT ${COLS}, ${relevance} AS score, ${fit} AS fit
          FROM "Professor" p JOIN "University" u ON u."id" = p."universityId"
          WHERE ${whereSql}
          ORDER BY ${order}
          OFFSET ${skip} LIMIT ${take}`,
        this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Professor" p WHERE ${whereSql}`,
      ]);
      return {
        items: items.map(({ fit: _f, ...r }) => ({ ...r, score: Number(r.score) })),
        total: Number(count[0]?.n ?? 0),
        page,
        pageSize,
      };
    });

    // Per-caller overlay, computed after the cache read.
    return {
      ...result,
      sort,
      items: result.items.map((r) => ({ ...r, matchedAreas: matchedAreas(interests, r.researchAreas ?? []) })),
    };
  }

  /** Facets for the filter panel. Empty facets (no data yet) are returned empty so the UI can hide them. */
  facets(universityId?: string) {
    return this.cache.wrap(Keys.profSearch(`facets:${universityId ?? 'all'}`), TTL.PROFESSOR, async () => {
      const scope = universityId ? Prisma.sql`WHERE "universityId" = ${universityId}` : Prisma.empty;
      const [ranks, openings, areas, depts, metrics] = await Promise.all([
        this.prisma.$queryRaw<{ k: string; n: bigint }[]>`SELECT "academicRank" k, count(*) n FROM "Professor" ${scope} GROUP BY 1 ORDER BY 2 DESC`,
        this.prisma.$queryRaw<{ k: string; n: bigint }[]>`SELECT o->>'type' k, count(DISTINCT "id") n FROM "Professor", jsonb_array_elements(coalesce("openPositions", '[]'::jsonb)) o ${scope} GROUP BY 1`,
        // Group spelling variants ("Cyber Security"/"Cybersecurity") under one label.
        this.prisma.$queryRaw<{ k: string; n: bigint }[]>`SELECT min(a) k, count(*) n FROM "Professor", unnest("researchAreas") a ${scope} GROUP BY hs_norm_tag(a) ORDER BY 2 DESC, 1 LIMIT 50`,
        this.prisma.$queryRaw<{ k: string; n: bigint }[]>`SELECT "department" k, count(*) n FROM "Professor" ${scope} GROUP BY 1 ORDER BY 2 DESC`,
        this.prisma.$queryRaw<{ h: bigint; c: bigint }[]>`SELECT count("hIndex") h, count("citationCount") c FROM "Professor" ${scope}`,
      ]);
      const fmt = (rows: { k: string; n: bigint }[]) => rows.filter((r) => r.k).map((r) => ({ key: r.k, count: Number(r.n) }));
      return {
        academicRanks: fmt(ranks),
        openings: fmt(openings),
        researchAreas: fmt(areas),
        departments: fmt(depts),
        withHIndex: Number(metrics[0]?.h ?? 0),
        withCitations: Number(metrics[0]?.c ?? 0),
      };
    });
  }

  async get(id: string, user: AuthUser) {
    const prof = await this.cache.wrap(Keys.prof(id), TTL.PROFESSOR, async () => {
      const p = await this.prisma.professor.findUnique({
        where: { id },
        select: {
          id: true, universityId: true, name: true, title: true, academicRank: true, email: true, department: true, photoUrl: true,
          bio: true, profileLink: true, googleScholarLink: true, labWebsite: true, hIndex: true, citationCount: true,
          acceptingStudents: true, researchAreas: true, openPositions: true, updatedAt: true,
          university: { select: { id: true, name: true, location: true, country: true, csRank: true, wesRequired: true } },
        },
      });
      if (!p) return null;
      // Aggregated from every student's outreach thread with this professor.
      const [agg] = await this.prisma.$queryRaw<{ threads: bigint; replied: bigint; positive: bigint; median_hours: number | null }[]>`
        SELECT count(*) AS threads,
               count("replyReceivedTime") AS replied,
               count(*) FILTER (WHERE "replyStatus" IN ('POSITIVE_REPLY','INTERVIEW')) AS positive,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM "replyReceivedTime" - "emailSentTime") / 3600)
                 FILTER (WHERE "replyReceivedTime" IS NOT NULL AND "emailSentTime" IS NOT NULL) AS median_hours
        FROM "ProfessorOutreach" WHERE "professorId" = ${id} AND "emailSentTime" IS NOT NULL`;
      const threads = Number(agg?.threads ?? 0);
      const outreachStats =
        threads >= MIN_THREADS_FOR_STATS
          ? {
              threads,
              replyRate: Math.round((Number(agg.replied) / threads) * 100),
              positiveRate: Math.round((Number(agg.positive) / threads) * 100),
              medianResponseHours: agg.median_hours == null ? null : Math.round(agg.median_hours),
            }
          : { threads, insufficientData: true as const };
      return { ...p, outreachStats };
    });
    if (!prof) throw new NotFoundException('Professor not found');

    const [interests, myOutreach, saved] = await Promise.all([
      this.interests(user),
      user.studentProfileId
        ? this.prisma.professorOutreach.findUnique({
            where: { studentId_professorId: { studentId: user.studentProfileId, professorId: id } },
            select: { id: true, replyStatus: true, emailSentTime: true, replyReceivedTime: true },
          })
        : null,
      user.studentProfileId
        ? this.prisma.savedItem
            .findUnique({ where: { studentId_type_targetId: { studentId: user.studentProfileId, type: 'PROFESSOR', targetId: id } } })
            .then(Boolean)
        : false,
    ]);
    return { ...prof, matchedAreas: matchedAreas(interests, prof.researchAreas), myOutreach, saved };
  }

  private clean<T extends Partial<UpsertProfessorDto>>(dto: T): T {
    return {
      ...dto,
      ...(dto.name && { name: stripHonorific(dto.name) }),
      ...(dto.email && { email: dto.email.toLowerCase() }),
      ...(dto.researchAreas && { researchAreas: normalizeList(dto.researchAreas) }),
    };
  }

  async create(dto: UpsertProfessorDto, admin: AuthUser) {
    const p = await this.prisma.professor.create({ data: this.clean(dto) as Prisma.ProfessorUncheckedCreateInput, select: { id: true, name: true } });
    await this.audit.log(admin.id, 'PROFESSOR_UPSERTED', 'PROFESSOR', p.id, null, dto);
    await Promise.all([this.cache.invalidateProfessors(), this.cache.invalidateUniversities()]);
    return p;
  }

  async update(id: string, dto: UpdateProfessorDto, admin: AuthUser) {
    await this.prisma.professor.findUniqueOrThrow({ where: { id }, select: { id: true } });
    const p = await this.prisma.professor.update({ where: { id }, data: this.clean(dto) as Prisma.ProfessorUncheckedUpdateInput, select: { id: true, name: true } });
    await this.audit.log(admin.id, 'PROFESSOR_UPSERTED', 'PROFESSOR', id, null, dto);
    // Research areas feed university match scores and facets.
    await Promise.all([this.cache.invalidateProfessors(), this.cache.invalidateUniversities()]);
    return p;
  }

  async remove(id: string, admin: AuthUser) {
    await this.prisma.professor.delete({ where: { id }, select: { id: true } });
    await this.audit.log(admin.id, 'PROFESSOR_DELETED', 'PROFESSOR', id);
    await Promise.all([this.cache.invalidateProfessors(), this.cache.invalidateUniversities()]);
    return { ok: true };
  }
}

@Controller('professors')
export class ProfessorsController {
  constructor(private readonly svc: ProfessorsService) {}

  @HttpCode(200) @Post('search') search(@Body() dto: ProfessorSearchDto, @CurrentUser() u: AuthUser) {
    return this.svc.search(dto, u);
  }
  @Get('facets') facets() {
    return this.svc.facets();
  }
  @Get('facets/:universityId') facetsFor(@Param('universityId') universityId: string) {
    return this.svc.facets(universityId);
  }
  @Get(':id') get(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.get(id, u);
  }
  @Roles('ADMIN', 'SUPER_ADMIN') @Post() create(@Body() dto: UpsertProfessorDto, @CurrentUser() u: AuthUser) {
    return this.svc.create(dto, u);
  }
  @Roles('ADMIN', 'SUPER_ADMIN') @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateProfessorDto, @CurrentUser() u: AuthUser) {
    return this.svc.update(id, dto, u);
  }
  @Roles('ADMIN', 'SUPER_ADMIN') @Delete(':id') remove(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.remove(id, u);
  }
}

@Module({ controllers: [ProfessorsController], providers: [ProfessorsService] })
export class ProfessorsModule {}
