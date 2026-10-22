import {
  BadRequestException,
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
import { Prisma, Role, SubscriptionPlan, TransactionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { IsId } from '../../common/validators';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../../common/audit/audit.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { PLANS } from '../../common/plans';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SessionService } from '../../common/auth/session.service';
import { paginate } from '../../common/student';

// ===================================================================== DTOs
class UserQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(SubscriptionPlan) plan?: SubscriptionPlan;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(2) fullName: string;
  @IsString() @MinLength(8) password: string;
  @IsOptional() @IsEnum(SubscriptionPlan) plan?: SubscriptionPlan;
}

/** PATCH /admin/users/:id/upgrade — set plan, optionally recording the offline payment. */
class UpgradeDto {
  @IsEnum(SubscriptionPlan) plan: SubscriptionPlan;
  @IsOptional() @IsDateString() planExpiresAt?: string;
  @IsOptional() @IsIn(['bKash', 'Nagad', 'Rocket', 'Manual']) paymentGateway?: string;
  @IsOptional() @IsString() referenceId?: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsString() @MinLength(3) notes: string;
}

class StatusDto {
  @IsBoolean() isActive: boolean;
}

/**
 * POST /admin/transactions/manual-reconcile
 * Either reconcile an existing transaction (transactionId) or record a fully
 * offline payment for a user (userId + plan + amount + gateway).
 */
class ReconcileDto {
  @IsOptional() @IsId() transactionId?: string;
  @IsOptional() @IsId() userId?: string;
  @IsOptional() @IsEnum(SubscriptionPlan) plan?: SubscriptionPlan;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsIn(['bKash', 'Nagad', 'Rocket', 'Manual']) paymentGateway?: string;
  @IsString() @MinLength(3) referenceId: string;
  @IsIn(['MANUALLY_RECONCILED', 'FAILED']) newStatus: TransactionStatus;
  @IsBoolean() applyPlan: boolean;
  @IsString() @MinLength(5) notes: string;
}

class TxQueryDto {
  @IsOptional() @IsEnum(TransactionStatus) status?: TransactionStatus;
  @IsOptional() @IsString() gateway?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

class RoleDto {
  @IsEnum(Role) role: Role;
}

// ===================================================================== Service
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  private userSelect = {
    id: true, email: true, role: true, plan: true, planExpiresAt: true, isActive: true, createdAt: true,
    studentProfile: { select: { fullName: true, targetDegree: true, _count: { select: { applications: true, outreachLogs: true } } } },
  } satisfies Prisma.UserSelect;

  /** Admins manage GU accounts. SUPER_ADMIN additionally sees staff via ?role=. */
  async listUsers(actor: AuthUser, q: UserQueryDto) {
    const { skip, take, page, pageSize } = paginate(q.page, q.pageSize ?? 20);
    const role = actor.role === 'SUPER_ADMIN' ? q.role : 'GU';
    const where: Prisma.UserWhereInput = {
      ...(role && { role }),
      ...(q.plan && { plan: q.plan }),
      ...(q.q && {
        OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { studentProfile: { fullName: { contains: q.q, mode: 'insensitive' } } }],
      }),
    };
    const [items, total, planCounts] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: this.userSelect }),
      this.prisma.user.count({ where }),
      this.prisma.user.groupBy({ by: ['plan'], where: { role: 'GU' }, _count: true, orderBy: { plan: 'asc' } }),
    ]);
    return { items, total, page, pageSize, planCounts: planCounts.map((p) => ({ plan: p.plan, count: p._count })) };
  }

  private async target(actor: AuthUser, id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: this.userSelect });
    if (!u) throw new NotFoundException('User not found');
    // Admins may only manage GU accounts; staff accounts are SUPER_ADMIN-only.
    if (u.role !== 'GU' && actor.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only a Super Admin can manage staff accounts');
    return u;
  }

  async getUser(actor: AuthUser, id: string) {
    const u = await this.target(actor, id);
    const transactions = await this.prisma.transaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 });
    return { ...u, transactions };
  }

  async createUser(actor: AuthUser, dto: CreateUserDto) {
    const email = dto.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email already registered');
    const u = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        plan: dto.plan ?? 'FREE',
        studentProfile: { create: { fullName: dto.fullName, targetDegree: 'MS', preferredCountries: [], researchInterests: [] } },
      },
      select: this.userSelect,
    });
    await this.audit.log(actor.id, 'USER_CREATED', 'USER', u.id, null, { email, plan: u.plan });
    return u;
  }

  async upgrade(actor: AuthUser, id: string, dto: UpgradeDto) {
    const before = await this.target(actor, id);
    const days = PLANS[dto.plan].validityDays;
    const expires = dto.planExpiresAt ? new Date(dto.planExpiresAt) : days ? new Date(Date.now() + days * 86_400_000) : null;

    const result = await this.prisma.$transaction(async (db) => {
      const user = await db.user.update({ where: { id }, data: { plan: dto.plan, planExpiresAt: expires }, select: this.userSelect });
      let transaction = null;
      if (dto.paymentGateway && dto.amount != null) {
        transaction = await db.transaction.create({
          data: {
            userId: id,
            amount: dto.amount,
            paymentGateway: dto.paymentGateway,
            gatewayTransactionId: dto.referenceId || null,
            planPurchased: dto.plan,
            status: 'MANUALLY_RECONCILED',
          },
        });
        await db.transactionAudit.create({
          data: {
            transactionId: transaction.id,
            performedByAdminId: actor.id,
            previousStatus: 'PENDING',
            newStatus: 'MANUALLY_RECONCILED',
            referenceId: dto.referenceId,
            reconciliationNotes: dto.notes,
          },
        });
      }
      await this.audit.log(actor.id, 'USER_PLAN_CHANGED', 'USER', id, { plan: before.plan, planExpiresAt: before.planExpiresAt }, { plan: dto.plan, planExpiresAt: expires, notes: dto.notes }, db);
      return { user, transaction };
    });
    await this.cache.invalidateUserRole(id); // takes effect on the user's next request
    return result;
  }

  async setStatus(actor: AuthUser, id: string, dto: StatusDto) {
    if (id === actor.id) throw new BadRequestException('You cannot disable your own account');
    await this.target(actor, id);
    const u = await this.prisma.user.update({ where: { id }, data: { isActive: dto.isActive }, select: this.userSelect });
    await this.audit.log(actor.id, dto.isActive ? 'USER_ENABLED' : 'USER_DISABLED', 'USER', id);
    await this.cache.invalidateUserRole(id);
    // A disabled account is signed out everywhere, not just refused new requests.
    if (!dto.isActive) await this.sessions.revokeAll(id, 'DISABLED');
    return u;
  }

  async deleteUser(actor: AuthUser, id: string) {
    if (id === actor.id) throw new BadRequestException('You cannot delete your own account');
    const before = await this.target(actor, id);
    const [audits, imports] = await Promise.all([
      this.prisma.transactionAudit.count({ where: { performedByAdminId: id } }),
      this.prisma.importJob.count({ where: { performedById: id } }),
    ]);
    if (audits || imports) {
      throw new ConflictException('This account has audit history; disable it instead of deleting');
    }
    await this.prisma.user.delete({ where: { id } });
    await this.audit.log(actor.id, 'USER_DELETED', 'USER', id, { email: before.email, plan: before.plan, role: before.role });
    await this.cache.invalidateUserRole(id);
    return { ok: true };
  }

  async reconcile(actor: AuthUser, dto: ReconcileDto) {
    const result = await this.prisma.$transaction(async (db) => {
      let tx;
      if (dto.transactionId) {
        tx = await db.transaction.findUnique({ where: { id: dto.transactionId } });
        if (!tx) throw new NotFoundException('Transaction not found');
        if (tx.status === 'SUCCESS' || tx.status === 'MANUALLY_RECONCILED') {
          throw new ConflictException(`Transaction is already ${tx.status}`);
        }
      } else {
        if (!dto.userId || !dto.plan || dto.amount == null || !dto.paymentGateway) {
          throw new BadRequestException('For an offline payment provide userId, plan, amount and paymentGateway');
        }
        tx = await db.transaction.create({
          data: { userId: dto.userId, amount: dto.amount, paymentGateway: dto.paymentGateway, planPurchased: dto.plan, status: 'PENDING' },
        });
      }
      const previousStatus = tx.status;
      const updated = await db.transaction.update({
        where: { id: tx.id },
        data: { status: dto.newStatus, gatewayTransactionId: tx.gatewayTransactionId ?? dto.referenceId },
      });
      const audit = await db.transactionAudit.create({
        data: {
          transactionId: tx.id,
          performedByAdminId: actor.id,
          previousStatus,
          newStatus: dto.newStatus,
          referenceId: dto.referenceId,
          reconciliationNotes: dto.notes,
        },
      });
      if (dto.applyPlan && dto.newStatus === 'MANUALLY_RECONCILED') {
        const days = PLANS[updated.planPurchased].validityDays;
        await db.user.update({
          where: { id: updated.userId },
          data: { plan: updated.planPurchased, planExpiresAt: days ? new Date(Date.now() + days * 86_400_000) : null },
        });
      }
      await this.audit.log(actor.id, 'TX_RECONCILED', 'TRANSACTION', tx.id, { status: previousStatus }, { status: dto.newStatus, referenceId: dto.referenceId, applyPlan: dto.applyPlan }, db);
      return { transaction: updated, audit };
    });
    if (dto.applyPlan) await this.cache.invalidateUserRole(result.transaction.userId);
    return result;
  }

  async transactions(q: TxQueryDto) {
    const { skip, take, page, pageSize } = paginate(q.page, q.pageSize ?? 25);
    // Summary cards count every status for the other filters, so the tiles stay useful while one status is selected.
    const base: Prisma.TransactionWhereInput = {
      ...(q.gateway && { paymentGateway: q.gateway }),
      ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
      ...(q.q && {
        OR: [
          { gatewayTransactionId: { contains: q.q, mode: 'insensitive' } },
          { user: { email: { contains: q.q, mode: 'insensitive' } } },
        ],
      }),
    };
    const where: Prisma.TransactionWhereInput = { ...base, ...(q.status && { status: q.status }) };
    const [items, total, summary] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: { id: true, email: true, studentProfile: { select: { fullName: true } } } },
          auditLogs: { orderBy: { timestamp: 'desc' }, take: 1, include: { admin: { select: { email: true } } } },
        },
      }),
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.groupBy({ by: ['status'], where: base, _count: true, _sum: { amount: true }, orderBy: { status: 'asc' } }),
    ]);
    return {
      items: items.map(({ rawResponse: _r, ...t }) => t),
      total,
      page,
      pageSize,
      summary: summary.map((s) => ({ status: s.status, count: s._count, amount: s._sum?.amount ?? 0 })),
    };
  }

  // ---------------------------------------------------- SUPER_ADMIN only
  async auditLogs(q: { page?: number; pageSize?: number; adminId?: string; targetType?: string; action?: string }) {
    const { skip, take, page, pageSize } = paginate(q.page, q.pageSize ?? 30);
    const where: Prisma.AdminActionLogWhereInput = {
      ...(q.adminId && { adminId: q.adminId }),
      ...(q.targetType && { targetType: q.targetType }),
      ...(q.action && { action: q.action }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminActionLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { admin: { select: { email: true, role: true } } } }),
      this.prisma.adminActionLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async reconciliationLogs(q: { page?: number; pageSize?: number }) {
    const { skip, take, page, pageSize } = paginate(q.page, q.pageSize ?? 30);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.transactionAudit.findMany({
        orderBy: { timestamp: 'desc' },
        skip,
        take,
        include: {
          admin: { select: { email: true } },
          transaction: { select: { id: true, amount: true, paymentGateway: true, planPurchased: true, user: { select: { email: true } } } },
        },
      }),
      this.prisma.transactionAudit.count(),
    ]);
    return { items, total, page, pageSize };
  }

  async setRole(actor: AuthUser, id: string, dto: RoleDto) {
    if (id === actor.id) throw new BadRequestException('You cannot change your own role');
    const before = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!before) throw new NotFoundException('User not found');
    if (before.role === 'SUPER_ADMIN' && dto.role !== 'SUPER_ADMIN') {
      const remaining = await this.prisma.user.count({ where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } } });
      if (!remaining) throw new ConflictException('At least one active Super Admin must remain');
    }
    const u = await this.prisma.user.update({ where: { id }, data: { role: dto.role }, select: this.userSelect });
    await this.audit.log(actor.id, 'USER_ROLE_CHANGED', 'USER', id, { role: before.role }, { role: dto.role });
    await this.cache.invalidateUserRole(id);
    return u;
  }

  async overview() {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [users, byPlan, revenue, pending, failed] = await Promise.all([
      this.prisma.user.count({ where: { role: 'GU' } }),
      this.prisma.user.groupBy({ by: ['plan'], where: { role: 'GU' }, _count: true }),
      this.prisma.transaction.aggregate({ where: { status: { in: ['SUCCESS', 'MANUALLY_RECONCILED'] }, createdAt: { gte: monthStart } }, _sum: { amount: true } }),
      this.prisma.transaction.count({ where: { status: 'PENDING' } }),
      this.prisma.transaction.count({ where: { status: 'FAILED', createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    ]);
    return {
      totalStudents: users,
      byPlan: byPlan.map((p) => ({ plan: p.plan, count: p._count })),
      revenueThisMonthBdt: revenue._sum.amount ?? 0,
      pendingTransactions: pending,
      failedLast7Days: failed,
    };
  }
}

// ===================================================================== Controllers
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  @Get('overview') overview() {
    return this.svc.overview();
  }
  @Get('users') listUsers(@CurrentUser() a: AuthUser, @Query() q: UserQueryDto) {
    return this.svc.listUsers(a, q);
  }
  @Post('users') createUser(@CurrentUser() a: AuthUser, @Body() dto: CreateUserDto) {
    return this.svc.createUser(a, dto);
  }
  @Get('users/:id') getUser(@CurrentUser() a: AuthUser, @Param('id') id: string) {
    return this.svc.getUser(a, id);
  }
  @Patch('users/:id/upgrade') upgrade(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: UpgradeDto) {
    return this.svc.upgrade(a, id, dto);
  }
  @Patch('users/:id/status') setStatus(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.svc.setStatus(a, id, dto);
  }
  @Delete('users/:id') deleteUser(@CurrentUser() a: AuthUser, @Param('id') id: string) {
    return this.svc.deleteUser(a, id);
  }
  /** Admins see actionable (PENDING/FAILED) transactions to reconcile. */
  @Get('transactions') transactions(@Query() q: TxQueryDto) {
    return this.svc.transactions({ ...q, status: q.status ?? undefined });
  }
  @Post('transactions/manual-reconcile') reconcile(@CurrentUser() a: AuthUser, @Body() dto: ReconcileDto) {
    return this.svc.reconcile(a, dto);
  }
}

@Roles('SUPER_ADMIN')
@Controller('superadmin')
export class SuperAdminController {
  constructor(private readonly svc: AdminService) {}

  @Get('transactions') transactions(@Query() q: TxQueryDto) {
    return this.svc.transactions(q);
  }
  @Get('audit-logs') auditLogs(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('adminId') adminId?: string,
    @Query('targetType') targetType?: string,
    @Query('action') action?: string,
  ) {
    return this.svc.auditLogs({ page, pageSize, adminId, targetType, action });
  }
  @Get('reconciliation-logs') reconciliationLogs(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.svc.reconciliationLogs({ page, pageSize });
  }
  @Patch('users/:id/role') setRole(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: RoleDto) {
    return this.svc.setRole(a, id, dto);
  }
}

@Module({ controllers: [AdminController, SuperAdminController], providers: [AdminService] })
export class AdminModule {}
