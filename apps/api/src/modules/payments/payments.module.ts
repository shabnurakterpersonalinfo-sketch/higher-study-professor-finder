import { BadRequestException, Body, Controller, Get, Injectable, Logger, Module, Param, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SubscriptionPlan } from '@prisma/client';
import { IsIn } from 'class-validator';
import { Response } from 'express';
import { CacheService } from '../../common/cache/cache.service';
import { AuthUser, CurrentUser, Public, AllowBeforeSetup } from '../../common/decorators';
import { PLANS, planRank } from '../../common/plans';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BkashGateway, GatewayName, MockGateway, NagadGateway, PaymentGateway } from './gateways';

class CheckoutDto {
  @IsIn(['STARTER', 'PRO', 'PREMIUM']) plan: SubscriptionPlan;
  @IsIn(['bKash', 'Nagad']) gateway: 'bKash' | 'Nagad';
}

@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);
  private readonly gateways: Record<string, PaymentGateway>;
  private readonly mock: boolean;
  private readonly apiUrl: string;
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    cfg: ConfigService,
  ) {
    this.mock = cfg.get('PAYMENT_MODE', 'mock') === 'mock';
    // The mock gateway approves every payment — never allow it in production.
    // Mock checkout lets anyone upgrade for free, so production refuses it unless a staging/demo
    // deploy opts in with ALLOW_MOCK_PAYMENTS=true.
    if (this.mock && cfg.get('NODE_ENV') === 'production' && cfg.get('ALLOW_MOCK_PAYMENTS') !== 'true') {
      throw new Error('PAYMENT_MODE=mock is not allowed when NODE_ENV=production (set PAYMENT_MODE=live with bKash keys, or ALLOW_MOCK_PAYMENTS=true for a staging/demo deploy)');
    }
    this.apiUrl = cfg.get('PUBLIC_API_URL', 'http://localhost:4000');
    this.webUrl = cfg.get('PUBLIC_WEB_URL', 'http://localhost:3000');
    const mock = new MockGateway(this.webUrl);
    this.gateways = this.mock ? { bKash: mock, Nagad: mock } : { bKash: new BkashGateway(cfg), Nagad: new NagadGateway() };
  }

  /** Prices, limits and which gateways can take a payment right now (Nagad needs merchant keys in live mode). */
  plans() {
    return {
      plans: Object.entries(PLANS).map(([plan, p]) => ({ plan, ...p })),
      gateways: [
        { id: 'bKash', available: true },
        { id: 'Nagad', available: this.mock },
      ],
      billing: { currency: 'BDT', periodDays: 365, autoRenew: false },
    };
  }

  /** Step 1: create a PENDING transaction and a gateway checkout; return the redirect URL. */
  async checkout(user: AuthUser, dto: CheckoutDto) {
    if (planRank(dto.plan) <= planRank(user.plan)) throw new BadRequestException('You already have this plan or higher');
    const amount = PLANS[dto.plan].priceBdt;
    const tx = await this.prisma.transaction.create({
      data: { userId: user.id, amount, paymentGateway: dto.gateway, planPurchased: dto.plan, status: 'PENDING' },
    });
    try {
      const gw = this.gateways[dto.gateway];
      const res = await gw.create({
        transactionId: tx.id,
        amount,
        payerReference: user.email,
        callbackUrl: `${this.apiUrl}/api/v1/payments/callback/${dto.gateway}`,
      });
      await this.prisma.transaction.update({
        where: { id: tx.id },
        data: { gatewayPaymentId: res.paymentId, rawResponse: (res.raw ?? undefined) as Prisma.InputJsonValue | undefined },
      });
      return { transactionId: tx.id, redirectUrl: res.redirectUrl };
    } catch (e) {
      await this.prisma.transaction.update({ where: { id: tx.id }, data: { status: 'FAILED', rawResponse: { error: (e as Error).message } } });
      throw e;
    }
  }

  /**
   * Step 2: gateway redirects the browser here. Idempotent — the PENDING→X
   * transition is a conditional update, so a double callback can't double-apply.
   */
  async callback(gateway: GatewayName, paymentId: string, status: string): Promise<string> {
    const tx = await this.prisma.transaction.findFirst({ where: { gatewayPaymentId: paymentId, paymentGateway: gateway } });
    if (!tx) return `${this.webUrl}/purchase-plan?result=unknown`;
    if (tx.status !== 'PENDING') return `${this.webUrl}/purchase-plan?result=${tx.status === 'SUCCESS' ? 'success' : 'failed'}`;

    if (status !== 'success') {
      await this.prisma.transaction.updateMany({ where: { id: tx.id, status: 'PENDING' }, data: { status: 'FAILED', rawResponse: { callbackStatus: status } } });
      return `${this.webUrl}/purchase-plan?result=${status === 'cancel' ? 'cancelled' : 'failed'}`;
    }

    let result;
    try {
      result = await this.gateways[gateway].execute(paymentId);
    } catch (e) {
      // Leave PENDING: an admin can reconcile it from the gateway panel.
      this.log.error(`execute failed for tx ${tx.id}: ${(e as Error).message}`);
      return `${this.webUrl}/purchase-plan?result=pending`;
    }
    await this.applyResult(tx.id, tx.userId, tx.planPurchased, result.status, result.gatewayTransactionId, result.raw);
    return `${this.webUrl}/purchase-plan?result=${result.status === 'SUCCESS' ? 'success' : 'failed'}`;
  }

  private async applyResult(txId: string, userId: string, plan: SubscriptionPlan, status: 'SUCCESS' | 'FAILED', trxId?: string, raw?: unknown) {
    await this.prisma.$transaction(async (db) => {
      const { count } = await db.transaction.updateMany({
        where: { id: txId, status: 'PENDING' },
        data: { status, gatewayTransactionId: trxId, rawResponse: (raw ?? undefined) as Prisma.InputJsonValue | undefined },
      });
      if (!count || status !== 'SUCCESS') return;
      const days = PLANS[plan].validityDays;
      await db.user.update({ where: { id: userId }, data: { plan, planExpiresAt: days ? new Date(Date.now() + days * 86_400_000) : null } });
      await db.notification.create({
        data: { userId, kind: 'PAYMENT', title: `Welcome to ${plan}`, body: `Your payment was received and your plan is now ${plan}.`, link: '/purchase-plan' },
      });
    });
    await this.cache.invalidateUserRole(userId);
  }

  /** Current plan, validity and usage — drives the "Your plan" banner on the upgrade page. */
  async subscription(user: AuthUser) {
    const [u, apps, pending, lastPaid] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { plan: true, planExpiresAt: true } }),
      user.studentProfileId ? this.prisma.application.count({ where: { studentId: user.studentProfileId } }) : 0,
      this.prisma.transaction.findFirst({
        where: { userId: user.id, status: 'PENDING', createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, planPurchased: true, paymentGateway: true, amount: true, createdAt: true },
      }),
      this.prisma.transaction.findFirst({
        where: { userId: user.id, status: { in: ['SUCCESS', 'MANUALLY_RECONCILED'] } },
        orderBy: { createdAt: 'desc' },
        select: { planPurchased: true, paymentGateway: true, amount: true, createdAt: true },
      }),
    ]);
    const spec = PLANS[u.plan];
    return {
      plan: u.plan,
      planExpiresAt: u.planExpiresAt,
      daysLeft: u.planExpiresAt ? Math.max(0, Math.ceil((u.planExpiresAt.getTime() - Date.now()) / 86_400_000)) : null,
      usage: { applications: apps, applicationsCap: spec.maxApplications },
      features: { visaTracking: spec.visaTracking },
      pendingPayment: pending,
      lastPayment: lastPaid,
    };
  }

  history(user: AuthUser) {
    return this.prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amount: true, currency: true, paymentGateway: true, gatewayTransactionId: true, planPurchased: true, status: true, createdAt: true },
    });
  }
}

@AllowBeforeSetup()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Public() @Get('plans') plans() {
    return this.svc.plans();
  }

  @Post('checkout') checkout(@CurrentUser() u: AuthUser, @Body() dto: CheckoutDto) {
    return this.svc.checkout(u, dto);
  }

  @Get('subscription') subscription(@CurrentUser() u: AuthUser) {
    return this.svc.subscription(u);
  }

  @Get('history') history(@CurrentUser() u: AuthUser) {
    return this.svc.history(u);
  }

  /** bKash appends ?paymentID=…&status=success|failure|cancel to the callback URL. */
  @Public()
  @Get('callback/:gateway')
  async callback(
    @Param('gateway') gateway: GatewayName,
    @Query('paymentID') paymentId: string,
    @Query('status') status: string,
    @Res() res: Response,
  ) {
    if (!paymentId) throw new BadRequestException('paymentID is required');
    res.redirect(302, await this.svc.callback(gateway, paymentId, status));
  }
}

@Module({ controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
