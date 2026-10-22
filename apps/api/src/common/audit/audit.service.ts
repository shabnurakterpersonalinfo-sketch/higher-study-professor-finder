import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AdminAction =
  | 'USER_CREATED'
  | 'USER_PLAN_CHANGED'
  | 'USER_ROLE_CHANGED'
  | 'USER_DISABLED'
  | 'USER_ENABLED'
  | 'USER_DELETED'
  | 'TX_RECONCILED'
  | 'UNIVERSITY_UPSERTED'
  | 'UNIVERSITY_DELETED'
  | 'PROGRAM_UPSERTED'
  | 'PROGRAM_DELETED'
  | 'PROFESSOR_UPSERTED'
  | 'PROFESSOR_DELETED'
  | 'CSV_IMPORT';

/** Writes the system-wide administrative action log that SUPER_ADMINs review. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(
    adminId: string,
    action: AdminAction,
    targetType: string,
    targetId: string,
    before?: unknown,
    after?: unknown,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.adminActionLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        before: (before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
