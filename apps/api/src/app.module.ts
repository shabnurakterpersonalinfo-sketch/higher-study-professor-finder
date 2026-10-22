import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { assertStrongJwtSecret, authSettings, JWT_AUDIENCE, JWT_ISSUER } from './common/auth/auth-config';
import { SessionModule } from './common/auth/session.service';
import { AuditModule } from './common/audit/audit.service';
import { CacheModule, CacheService } from './common/cache/cache.service';
import { Public } from './common/decorators';
import { ClientIpThrottlerGuard, JwtAuthGuard, PlanGuard, RolesGuard, SetupGuard } from './common/guards/auth.guards';
import { MailModule } from './common/mail/mail.service';
import { PrismaModule, PrismaService } from './common/prisma/prisma.service';
import { AdminModule } from './modules/admin/admin.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AuthModule } from './modules/auth/auth.module';
import { OutreachModule } from './modules/outreach/outreach.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProfessorsModule } from './modules/professors/professors.module';
import { ImportsModule } from './modules/imports/imports.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { StudentModule } from './modules/student/student.module';
import { UniversitiesModule } from './modules/universities/universities.module';
import { VisaModule } from './modules/visa/visa.module';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly cache: CacheService) {}

  @Public()
  @Get()
  async health() {
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'up').catch(() => 'down'),
      this.cache.redis.ping().then(() => 'up').catch(() => 'down'),
    ]);
    return { status: db === 'up' ? 'ok' : 'degraded', db, redis };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = assertStrongJwtSecret(process.env.JWT_SECRET);
        if (process.env.JWT_EXPIRES_IN) {
          // eslint-disable-next-line no-console
          console.warn('JWT_EXPIRES_IN is no longer used; access tokens last ACCESS_TOKEN_TTL (default 15m) and sessions renew via the refresh cookie.');
        }
        return {
          secret,
          signOptions: { expiresIn: authSettings().accessTtlSeconds, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, algorithm: 'HS256' },
          // Pin the algorithm so a token can't pick its own (e.g. "none").
          verifyOptions: { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
        };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CacheModule,
    SessionModule,
    MailModule,
    AuditModule,
    AuthModule,
    UniversitiesModule,
    ProgramsModule,
    ProfessorsModule,
    OutreachModule,
    ApplicationsModule,
    VisaModule,
    StudentModule,
    PaymentsModule,
    AdminModule,
    ImportsModule,
    OnboardingModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit → authenticate → role check → plan check → setup gate.
    { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PlanGuard },
    { provide: APP_GUARD, useClass: SetupGuard },
  ],
})
export class AppModule {}
