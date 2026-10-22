import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';
import { AuthUser, CurrentUser, RequiresPlan } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { requireStudent } from '../../common/student';

/**
 * Self-service visa timeline reminders. These are user-logged dates and alerts
 * only — HigherStudy does not process visas or give immigration advice.
 */
class VisaReminderDto {
  @IsOptional() @IsString() targetCountry?: string;
  @IsOptional() @IsDateString() i20OrCasReceivedDate?: string;
  @IsOptional() @IsDateString() visaAppointmentDate?: string;
  @IsOptional() @IsBoolean() sevisFeePaid?: boolean;
  @IsOptional() @IsDateString() bankSolvencyExpiryDate?: string;
  @IsOptional() @IsDateString() passportExpiryDate?: string;
  @IsOptional() @IsString() customNotes?: string;
  @IsOptional() @IsBoolean() notificationEnabled?: boolean;
}
class CreateVisaReminderDto extends VisaReminderDto {
  @IsString() declare targetCountry: string;
}

const DATES = ['i20OrCasReceivedDate', 'visaAppointmentDate', 'bankSolvencyExpiryDate', 'passportExpiryDate'] as const;
const toData = (dto: VisaReminderDto) => {
  const d: Record<string, unknown> = { ...dto };
  for (const f of DATES) if (dto[f]) d[f] = new Date(dto[f] as string);
  return d;
};
const daysUntil = (d: Date | null) => (d ? Math.ceil((d.getTime() - Date.now()) / 86_400_000) : null);

@Injectable()
export class VisaService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser) {
    const studentId = requireStudent(user);
    const rows = await this.prisma.visaReminder.findMany({ where: { studentId }, orderBy: { visaAppointmentDate: { sort: 'asc', nulls: 'last' } } });
    return rows.map((r) => ({
      ...r,
      countdown: {
        visaAppointment: daysUntil(r.visaAppointmentDate),
        bankSolvencyExpiry: daysUntil(r.bankSolvencyExpiryDate),
        passportExpiry: daysUntil(r.passportExpiryDate),
      },
    }));
  }

  async create(user: AuthUser, dto: CreateVisaReminderDto) {
    const studentId = requireStudent(user);
    return this.prisma.visaReminder.create({ data: { ...(toData(dto) as { targetCountry: string }), studentId } });
  }

  async update(user: AuthUser, id: string, dto: VisaReminderDto) {
    const studentId = requireStudent(user);
    const { count } = await this.prisma.visaReminder.updateMany({ where: { id, studentId }, data: toData(dto) });
    if (!count) throw new NotFoundException('Reminder not found');
    return this.prisma.visaReminder.findUnique({ where: { id } });
  }

  async remove(user: AuthUser, id: string) {
    const studentId = requireStudent(user);
    const { count } = await this.prisma.visaReminder.deleteMany({ where: { id, studentId } });
    if (!count) throw new NotFoundException('Reminder not found');
    return { ok: true };
  }
}

@RequiresPlan('PRO') // "Visa tracking" is a Pro feature on the pricing page
@Controller('visa-reminders')
export class VisaController {
  constructor(private readonly svc: VisaService) {}

  @Get() list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u);
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateVisaReminderDto) {
    return this.svc.create(u, dto);
  }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: VisaReminderDto) {
    return this.svc.update(u, id, dto);
  }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }
}

@Module({ controllers: [VisaController], providers: [VisaService] })
export class VisaModule {}
