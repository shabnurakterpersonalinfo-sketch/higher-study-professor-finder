import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { authSettings, clientIp, originAllowed, readCookie, REFRESH_COOKIE, REFRESH_COOKIE_PATH, refreshCookieOptions } from '../../common/auth/auth-config';
import { LoginLockout, SessionService } from '../../common/auth/session.service';
import { CacheService } from '../../common/cache/cache.service';
import { AllowBeforeSetup, AuthUser, CurrentUser, Public } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';

// Compared against when the email is unknown, so login timing doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

class RegisterDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(8) @MaxLength(128) password: string;
  @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @IsOptional() @IsIn(['MS', 'PhD', 'PostDoc']) targetDegree?: string;
}

class LoginDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MaxLength(128) password: string;
}

class ChangePasswordDto {
  @IsString() @MaxLength(128) currentPassword: string;
  @IsString() @MinLength(8) @MaxLength(128) newPassword: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
    private readonly lockout: LoginLockout,
    private readonly cache: CacheService,
  ) {}

  /** Access token for a session: `sub` + `sid` only; role and plan are looked up per request. */
  private accessToken(userId: string, sessionId: string) {
    return this.jwt.signAsync({ sub: userId, sid: sessionId });
  }

  /** Starts a session, sets the refresh cookie, returns the access token. */
  private async signIn(userId: string, req: Request, res: Response) {
    const { session, refreshToken } = await this.sessions.start(userId, req, clientIp(req));
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(this.sessions.cookieMaxAgeMs(session.expiresAt)));
    return { accessToken: await this.accessToken(userId, session.id), expiresIn: authSettings().accessTtlSeconds };
  }

  async register(dto: RegisterDto, req: Request, res: Response) {
    const email = dto.email.toLowerCase().trim();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email already registered');
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        // Role is always GU on self-signup; admins are promoted by a SUPER_ADMIN.
        studentProfile: { create: { fullName: dto.fullName, targetDegree: dto.targetDegree ?? 'MS', preferredCountries: [], researchInterests: [] } },
      },
    });
    return this.signIn(user.id, req, res);
  }

  async login(dto: LoginDto, req: Request, res: Response) {
    const email = dto.email.toLowerCase().trim();
    await this.lockout.assertNotLocked(email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.isActive) {
      await this.lockout.recordFailure(email);
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.lockout.clear(email);
    return this.signIn(user.id, req, res);
  }

  async refresh(req: Request, res: Response) {
    if (!originAllowed(req)) throw new ForbiddenException('Origin not allowed');
    try {
      const r = await this.sessions.rotate(readCookie(req, REFRESH_COOKIE), clientIp(req));
      res.cookie(REFRESH_COOKIE, r.refreshToken, refreshCookieOptions(this.sessions.cookieMaxAgeMs(r.expiresAt)));
      return { accessToken: await this.accessToken(r.userId, r.sessionId), expiresIn: authSettings().accessTtlSeconds };
    } catch (e) {
      // A dead session shouldn't leave a cookie behind; a lost race keeps the (new) cookie.
      if (e instanceof UnauthorizedException) res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
      throw e;
    }
  }

  /** Ends the session in the cookie. Works with an expired access token. */
  async logout(req: Request, res: Response) {
    if (!originAllowed(req)) throw new ForbiddenException('Origin not allowed');
    const raw = readCookie(req, REFRESH_COOKIE);
    const sid = raw?.split('.')[0];
    if (sid && /^[0-9a-f-]{36}$/.test(sid)) {
      // Only revoke if the cookie's secret matches, so a forged cookie can't log others out.
      await this.sessions.rotate(raw, clientIp(req)).then(
        (r) => this.sessions.revoke(r.sessionId, 'LOGOUT'),
        () => null,
      );
    }
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { ok: true };
  }

  async logoutAll(u: AuthUser, res: Response) {
    const n = await this.sessions.revokeAll(u.id, 'LOGOUT_ALL');
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { revoked: n };
  }

  async sessionsFor(u: AuthUser) {
    const list = await this.sessions.list(u.id);
    return list.map((s) => ({ ...s, current: s.id === u.sessionId }));
  }

  async revokeSession(u: AuthUser, id: string) {
    if (!(await this.sessions.revoke(id, 'REVOKED_BY_USER', u.id))) throw new NotFoundException('Session not found');
    return { ok: true };
  }

  async changePassword(u: AuthUser, dto: ChangePasswordDto) {
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException({ code: 'SAME_PASSWORD', message: 'The new password must be different from the current one' });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException({ code: 'WRONG_PASSWORD', message: 'Current password is incorrect' });
    }
    await this.prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) } });
    // Everyone else who had the old password is signed out; this device stays in.
    const revoked = await this.sessions.revokeAll(u.id, 'PASSWORD_CHANGED', u.sessionId);
    await this.cache.invalidateUserRole(u.id);
    return { ok: true, otherSessionsSignedOut: revoked };
  }

  async me(u: AuthUser) {
    const profile = u.studentProfileId
      ? await this.prisma.studentProfile.findUnique({ where: { id: u.studentProfileId }, select: { fullName: true, avatarUrl: true } })
      : null;
    const unread = await this.prisma.notification.count({ where: { userId: u.id, readAt: null } });
    return { ...u, fullName: profile?.fullName ?? u.email.split('@')[0], avatarUrl: profile?.avatarUrl ?? null, unreadNotifications: unread };
  }
}

@AllowBeforeSetup()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.register(dto, req, res);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto, req, res);
  }

  /** New access token from the refresh cookie (rotates the cookie). */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req, res);
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }

  @HttpCode(200)
  @Post('logout-all')
  logoutAll(@CurrentUser() u: AuthUser, @Res({ passthrough: true }) res: Response) {
    return this.auth.logoutAll(u, res);
  }

  @Get('sessions')
  sessions(@CurrentUser() u: AuthUser) {
    return this.auth.sessionsFor(u);
  }

  @Delete('sessions/:id')
  revokeSession(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.auth.revokeSession(u, id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('password')
  changePassword(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(u, dto);
  }

  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.auth.me(u);
  }
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}
