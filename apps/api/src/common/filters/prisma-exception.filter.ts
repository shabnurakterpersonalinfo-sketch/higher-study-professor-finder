import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/** Maps common Prisma errors to clean HTTP responses instead of bare 500s. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('Prisma');

  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, 'Already exists'],
      P2003: [HttpStatus.BAD_REQUEST, 'Related record not found'],
      P2025: [HttpStatus.NOT_FOUND, 'Record not found'],
      // Table/column missing: the code is newer than the database.
      P2021: [HttpStatus.INTERNAL_SERVER_ERROR, 'Database schema is out of date. Run `npx prisma migrate deploy` in apps/api and restart the API.'],
      P2022: [HttpStatus.INTERNAL_SERVER_ERROR, 'Database schema is out of date. Run `npx prisma migrate deploy` in apps/api and restart the API.'],
    };
    const [status, message] = map[e.code] ?? [HttpStatus.INTERNAL_SERVER_ERROR, 'Database error'];
    // Keep the real cause in the server log; the client only gets the summary.
    if (status >= 500) this.log.error(`${e.code} ${JSON.stringify(e.meta ?? {})} ${e.message.split('\n').slice(-1)[0]}`);
    res.status(status).json({ statusCode: status, message, code: e.code });
  }
}
