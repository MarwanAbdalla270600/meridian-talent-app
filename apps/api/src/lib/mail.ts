import nodemailer from 'nodemailer';
import type { Env } from '../config/env';
import type { Logger } from './logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

export function createSmtpMailer(env: Env, logger: Logger): Mailer {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } } : {}),
  });
  return {
    async send(msg) {
      await transport.sendMail({ from: env.MAIL_FROM, ...msg });
      logger.info('mail sent', { subjectLength: msg.subject.length });
    },
  };
}

/** Captures messages in memory (tests). */
export function createMemoryMailer(): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(msg) {
      sent.push(msg);
    },
  };
}
