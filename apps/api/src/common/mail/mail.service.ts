import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/** SMTP mailer. With no SMTP_HOST configured it logs instead of sending (dev). */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private readonly transport: nodemailer.Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.from = config.get<string>('MAIL_FROM', 'HigherStudy <no-reply@higherstudy.app>');
    this.transport = host
      ? nodemailer.createTransport({
          host,
          port: Number(config.get('SMTP_PORT', 587)),
          auth: config.get('SMTP_USER') ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') } : undefined,
        })
      : null;
  }

  async send(to: string, subject: string, text: string) {
    if (!this.transport) {
      this.log.log(`[mail:dev] to=${to} subject="${subject}"`);
      return;
    }
    await this.transport.sendMail({ from: this.from, to, subject, text });
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
