import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  GoneException,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuditService } from '../../common/audit/audit.service';
import { CacheService } from '../../common/cache/cache.service';
import { parseCsvTable } from '../../common/csv';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import {
  checkHeader,
  DIRECTORY_ENTITIES,
  DirectoryEntity,
  PARSERS,
  ProfessorRow,
  ProgramRow,
  templateCsv,
  UniversityRow,
} from '../../common/directory-rows';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginate } from '../../common/student';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 5000;
const PREVIEW_TTL_SECONDS = 30 * 60;
const previewKey = (id: string) => `hs:import:${id}`;

type Action = 'create' | 'update' | 'unchanged' | 'error';
type Change = [field: string, before: unknown, after: unknown];

export interface PreviewRow {
  line: number;
  action: Action;
  id: string | null;
  label: string;
  errors: string[];
  warnings: string[];
  changes: Change[];
}
/** What's kept in Redis between preview and commit: only what the commit needs. */
interface StoredPreview {
  entity: DirectoryEntity;
  fileName: string;
  adminId: string;
  totalRows: number;
  errorLines: { line: number; errors: string[] }[];
  writes: { action: 'create' | 'update'; id: string; data: Record<string, unknown> }[];
  unchanged: number;
}

class CommitDto {
  /** Import the valid rows and skip rows with errors. Without it, any error blocks the import. */
  @IsOptional() @IsBoolean() allowPartial?: boolean;
}
class HistoryQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}

/** Fields compared for "unchanged" detection and written on update (never id/foreign refs). */
const COMPARE: Record<DirectoryEntity, string[]> = {
  universities: ['name', 'location', 'csRank', 'wesRequired', 'country', 'state', 'csRankPosition', 'csRankTied'],
  programs: [
    'programName', 'degreeLevel', 'catalogLink', 'deadlineDate', 'applicationFee', 'feeWaiverType', 'feeWaiverInfo',
    'greRequirement', 'ieltsRequirement', 'financialAidPolicy', 'limitationsNotes', 'applicationFeeUsd', 'greRequired',
    'ieltsMinOverall', 'fundingLevel', 'wesRequired',
  ],
  professors: ['name', 'email', 'department', 'profileLink', 'googleScholarLink', 'labWebsite', 'hIndex', 'citationCount', 'acceptingStudents', 'researchAreas'],
};

type Existing = Record<string, unknown> & { id: string; universityId?: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const lc = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

@Injectable()
export class ImportsService {
  private readonly log = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
  ) {}

  entity(raw: string): DirectoryEntity {
    if (!DIRECTORY_ENTITIES.includes(raw as DirectoryEntity)) {
      throw new BadRequestException(`Unknown import type "${raw}". Use one of: ${DIRECTORY_ENTITIES.join(', ')}`);
    }
    return raw as DirectoryEntity;
  }

  // ------------------------------------------------------------- preview
  async preview(entity: DirectoryEntity, file: Express.Multer.File, admin: AuthUser) {
    const text = file.buffer.toString('utf8');
    if (text.includes('�')) throw new BadRequestException('The file is not UTF-8 text. Save it as "CSV UTF-8" and try again.');

    let table;
    try {
      table = parseCsvTable(text, file.originalname, { lenient: true });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (!table.header.length) throw new BadRequestException('The file is empty.');
    const { missing, unknown } = checkHeader(entity, table.header);
    if (missing.length) {
      throw new BadRequestException({
        code: 'MISSING_COLUMNS',
        message: `Missing required column(s): ${missing.join(', ')}. Download the template to see the expected header.`,
        missing,
      });
    }
    if (!table.rows.length) throw new BadRequestException('The file has a header but no rows.');
    if (table.rows.length > MAX_ROWS) throw new BadRequestException(`Too many rows (${table.rows.length}). Split the file into parts of ${MAX_ROWS} or fewer.`);

    const ctx = await this.context(entity);
    const seenIds = new Map<string, number>();
    const seenKeys = new Map<string, number>();
    const rows: PreviewRow[] = [];
    const writes: StoredPreview['writes'] = [];

    for (const { line, record, error } of table.rows) {
      const out: PreviewRow = { line, action: 'error', id: null, label: '', errors: [], warnings: [], changes: [] };
      rows.push(out);
      if (error) {
        out.errors.push(error);
        continue;
      }
      const parsed = PARSERS[entity](record);
      out.warnings.push(...parsed.warnings);
      out.errors.push(...parsed.errors);
      const row = parsed.data;
      out.label = (record.name || record.program_name || '').trim();
      if (!row) continue;

      // Resolve the university reference (id, or exact name) for programs & professors.
      let universityId: string | null = null;
      if ('universityRef' in row) {
        universityId = ctx.uniById.has(row.universityRef) ? row.universityRef : ctx.uniByName.get(lc(row.universityRef)) ?? null;
        if (!universityId) {
          out.errors.push(`university_id "${row.universityRef}" not found — use an existing university id or its exact name (import universities first)`);
          continue;
        }
        out.label = `${out.label} · ${ctx.uniById.get(universityId)}`;
      }

      // Match an existing record: explicit id first, then a natural key.
      const natural = this.naturalKey(entity, row, universityId);
      const existing = (row.id && ctx.byId.get(row.id)) || (!row.id && natural ? ctx.byNatural.get(natural) : undefined) || null;
      const id = row.id ?? existing?.id ?? randomUUID();
      out.id = id;

      // Duplicates inside the same file would silently overwrite each other.
      const dupOf = seenIds.get(id) ?? (natural ? seenKeys.get(natural) : undefined);
      if (dupOf) {
        out.errors.push(`duplicate of line ${dupOf} (same ${seenIds.has(id) ? 'id' : entity === 'universities' ? 'name' : 'record'})`);
        continue;
      }
      seenIds.set(id, line);
      if (natural) seenKeys.set(natural, line);
      if (row.id && !existing && natural && ctx.byNatural.has(natural)) {
        out.warnings.push(`another record (${ctx.byNatural.get(natural)!.id}) already has this ${entity === 'universities' ? 'name' : 'key'} — a second one will be created`);
      }

      const data = this.toData(entity, row, universityId);
      if (!existing) {
        out.action = 'create';
        writes.push({ action: 'create', id, data: { id, ...data, ...(entity === 'professors' && data.acceptingStudents == null ? { acceptingStudents: true } : {}) } });
        continue;
      }
      const patch: Record<string, unknown> = {};
      for (const f of COMPARE[entity]) {
        if (!(f in data)) continue;
        if (entity === 'professors' && f === 'acceptingStudents' && data[f] == null) continue; // empty cell = keep current
        if (!same(existing[f], data[f])) {
          patch[f] = data[f];
          out.changes.push([f, existing[f] ?? null, data[f] ?? null]);
        }
      }
      if (universityId && existing.universityId !== universityId) {
        patch.universityId = universityId;
        out.changes.push(['universityId', existing.universityId, universityId]);
      }
      out.action = out.changes.length ? 'update' : 'unchanged';
      if (out.changes.length) writes.push({ action: 'update', id, data: patch });
    }

    const count = (a: Action) => rows.filter((r) => r.action === a).length;
    const summary = {
      total: rows.length,
      create: count('create'),
      update: count('update'),
      unchanged: count('unchanged'),
      error: count('error'),
      warnings: rows.filter((r) => r.warnings.length).length,
    };
    const importId = randomUUID();
    const stored: StoredPreview = {
      entity,
      fileName: file.originalname,
      adminId: admin.id,
      totalRows: rows.length,
      errorLines: rows.filter((r) => r.action === 'error').map((r) => ({ line: r.line, errors: r.errors })),
      writes,
      unchanged: summary.unchanged,
    };
    await this.cache.redis.set(previewKey(importId), JSON.stringify(stored), 'EX', PREVIEW_TTL_SECONDS);

    return {
      importId,
      entity,
      fileName: file.originalname,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_SECONDS * 1000).toISOString(),
      fileWarnings: unknown.length ? [`Ignored unknown column(s): ${unknown.join(', ')}`] : [],
      summary,
      rows,
    };
  }

  private naturalKey(entity: DirectoryEntity, row: UniversityRow | ProgramRow | ProfessorRow, universityId: string | null): string | null {
    if (entity === 'universities') return `u:${lc((row as UniversityRow).name)}`;
    if (entity === 'programs') {
      const p = row as ProgramRow;
      return `p:${universityId}:${lc(p.programName)}:${p.degreeLevel}`;
    }
    const p = row as ProfessorRow;
    return p.email ? `f:${universityId}:${lc(p.email)}` : `f:${universityId}:name:${lc(p.name)}`;
  }

  private toData(entity: DirectoryEntity, row: UniversityRow | ProgramRow | ProfessorRow, universityId: string | null): Record<string, unknown> {
    const { id: _id, ...rest } = row as unknown as Record<string, unknown>;
    delete rest.universityRef;
    return universityId ? { ...rest, universityId } : rest;
  }

  /** Existing rows indexed by id and natural key, plus university lookups. */
  private async context(entity: DirectoryEntity) {
    const unis = await this.prisma.university.findMany({ select: { id: true, name: true } });
    const uniById = new Map(unis.map((u) => [u.id, u.name]));
    const uniByName = new Map(unis.map((u) => [lc(u.name), u.id]));
    let existing: Existing[];
    if (entity === 'universities') existing = (await this.prisma.university.findMany()) as Existing[];
    else if (entity === 'programs') existing = (await this.prisma.program.findMany()) as Existing[];
    else {
      existing = (await this.prisma.professor.findMany({
        select: Object.fromEntries(['id', 'universityId', ...COMPARE.professors].map((f) => [f, true])) as Prisma.ProfessorSelect,
      })) as unknown as Existing[];
    }
    const byId = new Map(existing.map((e) => [e.id, e]));
    const byNatural = new Map<string, Existing>();
    for (const e of existing) {
      const key =
        entity === 'universities'
          ? `u:${lc(e.name as string)}`
          : entity === 'programs'
            ? `p:${e.universityId}:${lc(e.programName as string)}:${e.degreeLevel}`
            : e.email
              ? `f:${e.universityId}:${lc(e.email as string)}`
              : `f:${e.universityId}:name:${lc(e.name as string)}`;
      if (!byNatural.has(key)) byNatural.set(key, e);
    }
    return { uniById, uniByName, byId, byNatural };
  }

  // ------------------------------------------------------------- commit
  async commit(importId: string, admin: AuthUser, dto: CommitDto) {
    const raw = await this.cache.redis.get(previewKey(importId));
    if (!raw) throw new GoneException('This preview has expired or was already imported. Upload the file again.');
    const p = JSON.parse(raw) as StoredPreview;
    if (p.adminId !== admin.id) throw new ForbiddenException('Only the admin who uploaded this file can import it.');
    if (p.errorLines.length && !dto.allowPartial) {
      throw new BadRequestException({
        code: 'ROWS_HAVE_ERRORS',
        message: `${p.errorLines.length} row(s) have errors. Fix the file, or import the valid rows and skip those.`,
      });
    }
    // Atomic claim: a double-click or a second tab can't import the same preview twice.
    if (!(await this.cache.redis.getdel(previewKey(importId)))) throw new ConflictException('This import is already being processed.');

    const counts = {
      created: p.writes.filter((w) => w.action === 'create').length,
      updated: p.writes.filter((w) => w.action === 'update').length,
      unchanged: p.unchanged,
      skipped: p.errorLines.length,
    };
    const issues = p.errorLines.slice(0, 200) as unknown as Prisma.InputJsonValue;

    try {
      const job = await this.prisma.$transaction(
        async (tx) => {
          for (const w of p.writes) {
            if (p.entity === 'universities') {
              if (w.action === 'create') await tx.university.create({ data: w.data as Prisma.UniversityUncheckedCreateInput });
              else await tx.university.update({ where: { id: w.id }, data: w.data });
            } else if (p.entity === 'programs') {
              if (w.action === 'create') await tx.program.create({ data: w.data as Prisma.ProgramUncheckedCreateInput });
              else await tx.program.update({ where: { id: w.id }, data: w.data as Prisma.ProgramUncheckedUpdateInput });
            } else {
              if (w.action === 'create') await tx.professor.create({ data: w.data as Prisma.ProfessorUncheckedCreateInput, select: { id: true } });
              else await tx.professor.update({ where: { id: w.id }, data: w.data as Prisma.ProfessorUncheckedUpdateInput, select: { id: true } });
            }
          }
          const job = await tx.importJob.create({
            data: { entity: p.entity, fileName: p.fileName, performedById: admin.id, status: 'COMMITTED', totalRows: p.totalRows, ...counts, issues },
          });
          await this.audit.log(admin.id, 'CSV_IMPORT', p.entity.toUpperCase().slice(0, -1), job.id, null, { fileName: p.fileName, ...counts }, tx);
          return job;
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
      await Promise.all([this.cache.invalidateUniversities(), this.cache.invalidateProfessors()]);
      return { job, ...counts };
    } catch (e) {
      const message = (e as Error).message?.split('\n').slice(-1)[0] ?? 'unknown error';
      this.log.error(`import ${importId} (${p.entity}) failed: ${message}`);
      await this.prisma.importJob.create({
        data: {
          entity: p.entity, fileName: p.fileName, performedById: admin.id, status: 'FAILED', totalRows: p.totalRows,
          skipped: p.totalRows, issues: { failure: message } as Prisma.InputJsonValue,
        },
      });
      throw new ConflictException({
        code: 'IMPORT_FAILED',
        message: 'Nothing was imported: the database rejected a row (it may have changed since the preview). Upload the file again to re-check.',
        detail: message,
      });
    }
  }

  async history(q: HistoryQuery) {
    const { skip, take, page, pageSize } = paginate(q.page, 15);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.importJob.findMany({ orderBy: { createdAt: 'desc' }, skip, take, include: { performedBy: { select: { email: true, role: true } } } }),
      this.prisma.importJob.count(),
    ]);
    return { items, total, page, pageSize };
  }
}

@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin/imports')
export class ImportsController {
  constructor(private readonly svc: ImportsService) {}

  @Get() history(@Query() q: HistoryQuery) {
    return this.svc.history(q);
  }

  /** Header + one example row. */
  @Get('templates/:entity')
  template(@Param('entity') entity: string, @Res() res: Response) {
    const e = this.svc.entity(entity);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${e}-template.csv"`);
    res.send(templateCsv(e));
  }

  @HttpCode(200)
  @Post(':entity/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  preview(
    @Param('entity') entity: string,
    @UploadedFile(new ParseFilePipeBuilder().addMaxSizeValidator({ maxSize: MAX_FILE_BYTES }).build({ fileIsRequired: true }))
    file: Express.Multer.File,
    @CurrentUser() admin: AuthUser,
  ) {
    const e = this.svc.entity(entity);
    if (!/\.csv$/i.test(file.originalname) && !/csv|text\/plain|excel/i.test(file.mimetype)) {
      throw new BadRequestException('Upload a .csv file. In Excel or Google Sheets: File → Download/Save as → CSV.');
    }
    return this.svc.preview(e, file, admin);
  }

  @HttpCode(200)
  @Post(':importId/commit')
  commit(@Param('importId') importId: string, @Body() dto: CommitDto, @CurrentUser() admin: AuthUser) {
    return this.svc.commit(importId, admin, dto);
  }
}

@Module({ controllers: [ImportsController], providers: [ImportsService] })
export class ImportsModule {}
