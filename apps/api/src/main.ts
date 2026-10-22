import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind a platform proxy (Railway, Render, a load balancer) every request comes from the
  // proxy's IP, so the per-IP rate limits would be shared by all users. TRUST_PROXY=1 tells
  // Express to read the client IP from X-Forwarded-For. Leave it unset when nothing sits in front.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.use(helmet());
  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((o) => o.trim().replace(/\/$/, '')), credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4000);
  if (process.env.NODE_ENV === 'production' && !process.env.PROXY_SECRET && !process.env.TRUST_PROXY) {
    Logger.warn('Neither PROXY_SECRET nor TRUST_PROXY is set: rate limits will see the proxy\'s IP for every user.', 'Bootstrap');
  }
  await app.listen(port);
  Logger.log(`HigherStudy API on :${port}/api/v1`, 'Bootstrap');
}
bootstrap();
