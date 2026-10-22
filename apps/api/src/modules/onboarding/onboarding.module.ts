import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, Post } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNumber, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CacheService } from '../../common/cache/cache.service';
import { AllowBeforeSetup, AuthUser, CurrentUser } from '../../common/decorators';
import { normalizeList } from '../../common/derive';
import { FEATURE_IDS, featuresFor } from '../../common/features';
import { PrismaService } from '../../common/prisma/prisma.service';
import { requireStudent } from '../../common/student';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimList = ({ value }: { value: unknown }) =>
  Array.isArray(value) && value.every((v) => typeof v === 'string') ? normalizeList(value as string[]) : value;

/**
 * The essentials a new student fills in before the app opens. Kept in sync with
 * the 3-step setup screen (apps/web/src/app/welcome).
 */
export class CompleteSetupDto {
  // Step 1 — about you
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @Transform(trim) @Matches(/^\+?[0-9][0-9 -]{6,18}$/, { message: 'phone must be a valid phone number' }) phone: string;
  // Step 2 — your studies
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(160) undergradInstitution: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) undergradMajor: string;
  @IsNumber() @Min(0) @Max(10) cgpa: number;
  @IsNumber() @IsIn([4, 5, 10]) cgpaScale: number;
  // Step 3 — what you're aiming for
  @IsIn(['MS', 'PhD', 'PostDoc']) targetDegree: string;
  @IsIn(['Fall', 'Spring', 'Summer']) targetIntake: string;
  @IsIn(['FULLY_FUNDED', 'PARTIAL', 'SELF']) fundingPreference: string;
  @Transform(trimList) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(60, { each: true }) preferredCountries: string[];
  @Transform(trimList) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(15) @IsString({ each: true }) @MaxLength(80, { each: true }) researchInterests: string[];
}

/** Profile fields the setup requires; used to report what's missing. */
const REQUIRED: (keyof CompleteSetupDto)[] = [
  'fullName', 'phone', 'undergradInstitution', 'undergradMajor', 'cgpa',
  'targetDegree', 'targetIntake', 'fundingPreference', 'preferredCountries', 'researchInterests',
];

const TOUR_ID = /^[a-z0-9][a-z0-9:-]{0,47}$/;

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService, private readonly cache: CacheService) {}

  async state(u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { plan: true, createdAt: true, profileCompletedAt: true, toursSeen: true, featuresSeen: true, studentProfile: true },
    });
    const p = user.studentProfile as Record<string, unknown> | null;
    const missing = u.role !== 'GU' ? [] : REQUIRED.filter((k) => {
      const v = p?.[k];
      return v == null || v === '' || (Array.isArray(v) && v.length === 0);
    });
    return {
      setup: { required: u.role === 'GU', done: u.role !== 'GU' || user.profileCompletedAt != null, completedAt: user.profileCompletedAt, missing },
      toursSeen: user.toursSeen,
      // Highlights are a student thing; staff menus don't get them.
      features: u.role === 'GU' ? featuresFor(user) : [],
    };
  }

  async completeSetup(u: AuthUser, dto: CompleteSetupDto) {
    if (dto.cgpa > dto.cgpaScale) throw new BadRequestException({ code: 'CGPA_OVER_SCALE', message: `CGPA can't be higher than the ${dto.cgpaScale} scale` });
    const studentId = requireStudent(u);
    await this.prisma.$transaction([
      this.prisma.studentProfile.update({ where: { id: studentId }, data: dto }),
      // Keep the first completion time if they run setup again.
      this.prisma.user.updateMany({ where: { id: u.id, profileCompletedAt: null }, data: { profileCompletedAt: new Date() } }),
    ]);
    await Promise.all([this.cache.invalidateUserRole(u.id), this.cache.invalidateStudent(u.id)]);
    return this.state({ ...u, setupDone: true });
  }

  private async mark(u: AuthUser, field: 'toursSeen' | 'featuresSeen', id: string) {
    // Append only if absent, in one statement, so a double click can't store it twice.
    // The 200-entry CHECK constraint backs this up.
    await this.prisma.user.updateMany({ where: { id: u.id, NOT: { [field]: { has: id } } }, data: { [field]: { push: id } } });
    return { ok: true };
  }

  markTour(u: AuthUser, id: string) {
    if (!TOUR_ID.test(id)) throw new BadRequestException('Unknown tour id');
    return this.mark(u, 'toursSeen', id);
  }

  markFeature(u: AuthUser, id: string) {
    if (!FEATURE_IDS.has(id)) throw new BadRequestException('Unknown feature id');
    return this.mark(u, 'featuresSeen', id);
  }

  async resetTours(u: AuthUser) {
    await this.prisma.user.update({ where: { id: u.id }, data: { toursSeen: [] } });
    return { ok: true };
  }
}

@AllowBeforeSetup()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}

  @Get() state(@CurrentUser() u: AuthUser) {
    return this.svc.state(u);
  }
  @HttpCode(200) @Post('setup') complete(@CurrentUser() u: AuthUser, @Body() dto: CompleteSetupDto) {
    return this.svc.completeSetup(u, dto);
  }
  @HttpCode(200) @Post('tours/:id/seen') tour(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.markTour(u, id);
  }
  /** "Show tips again" in Settings. */
  @Delete('tours') reset(@CurrentUser() u: AuthUser) {
    return this.svc.resetTours(u);
  }
  @HttpCode(200) @Post('features/:id/seen') feature(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.markFeature(u, id);
  }
}

@Module({ controllers: [OnboardingController], providers: [OnboardingService] })
export class OnboardingModule {}
