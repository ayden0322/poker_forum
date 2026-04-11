import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from './sms.service';
import { hashOtp, verifyOtp } from '../common/crypto.util';
import { generateOtp, normalizeTwMobile } from './phone.util';

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_TOKEN_TTL_MINUTES = 15;

@Injectable()
export class PhoneVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly mail: MailService,
  ) {}

  // ===== 首次綁定：送 OTP =====
  async sendBindOtp(userId: string, rawPhone: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('使用者不存在');
    if (user.phoneVerified) throw new ConflictException('此帳號已完成手機驗證');

    const phone = normalizeTwMobile(rawPhone);

    // 一個手機只能綁一個帳號
    const occupied = await this.prisma.user.findFirst({
      where: { phone, NOT: { id: userId } },
      select: { id: true },
    });
    if (occupied) throw new ConflictException('此手機號碼已被其他帳號綁定');

    await this.assertCooldown(userId, 'BIND');

    const code = generateOtp();
    const codeHash = hashOtp(code, userId);

    await this.prisma.$transaction([
      // 作廢舊的未使用驗證碼
      this.prisma.phoneVerification.updateMany({
        where: { userId, purpose: 'BIND', consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.phoneVerification.create({
        data: {
          userId,
          phone,
          codeHash,
          purpose: 'BIND',
          expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
          ip,
        },
      }),
    ]);

    const result = await this.sms.send({ phone, code });
    if (!result.success) {
      throw new BadRequestException({
        code: 'SMS_SEND_FAILED',
        message: '簡訊發送失敗，請稍後再試',
        detail: result.error,
      });
    }

    return { phone: maskPhone(phone), expiresInSeconds: OTP_TTL_MINUTES * 60 };
  }

  // ===== 首次綁定：驗證 OTP =====
  async confirmBindOtp(userId: string, code: string) {
    const record = await this.prisma.phoneVerification.findFirst({
      where: { userId, purpose: 'BIND', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new NotFoundException('找不到驗證紀錄，請重新取得驗證碼');

    if (record.expiresAt < new Date()) {
      throw new BadRequestException({ code: 'OTP_EXPIRED', message: '驗證碼已過期，請重新取得' });
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException({ code: 'OTP_TOO_MANY_ATTEMPTS', message: '嘗試次數過多，請重新取得驗證碼' });
    }

    if (!verifyOtp(code, record.codeHash, userId)) {
      await this.prisma.phoneVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException({ code: 'OTP_INVALID', message: '驗證碼錯誤' });
    }

    await this.prisma.$transaction([
      this.prisma.phoneVerification.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          phone: record.phone,
          phoneVerified: true,
          phoneVerifiedAt: new Date(),
        },
      }),
    ]);

    return { success: true };
  }

  // ===== 換綁：寄 email 驗證信 =====
  async requestPhoneChangeEmail(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('使用者不存在');
    if (!user.email) {
      throw new BadRequestException({ code: 'EMAIL_NOT_BOUND', message: '此帳號未綁定 Email，無法進行換綁' });
    }
    if (!user.phoneVerified) {
      throw new BadRequestException({ code: 'PHONE_NOT_VERIFIED', message: '此帳號尚未完成首次手機驗證' });
    }

    const token = randomBytes(32).toString('hex');
    await this.prisma.emailVerification.create({
      data: {
        userId,
        token,
        purpose: 'PHONE_CHANGE',
        expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MINUTES * 60 * 1000),
      },
    });

    const webBase = process.env.WEB_URL || 'http://localhost:3010';
    const confirmUrl = `${webBase}/settings/phone/change-confirm?token=${token}`;
    await this.mail.sendPhoneChangeVerification(user.email, confirmUrl, user.nickname);

    return { sentTo: maskEmail(user.email), expiresInSeconds: EMAIL_TOKEN_TTL_MINUTES * 60 };
  }

  // ===== 換綁：驗證 email token 並返回短期 session token =====
  async confirmPhoneChangeEmail(token: string) {
    const record = await this.prisma.emailVerification.findUnique({ where: { token } });
    if (!record || record.purpose !== 'PHONE_CHANGE') {
      throw new NotFoundException('驗證連結無效');
    }
    if (record.usedAt) {
      throw new BadRequestException({ code: 'TOKEN_ALREADY_USED', message: '此連結已使用過' });
    }
    if (record.expiresAt < new Date()) {
      throw new BadRequestException({ code: 'TOKEN_EXPIRED', message: '驗證連結已過期' });
    }

    await this.prisma.emailVerification.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    // 回傳一個短期 token 給前端（10 分鐘），讓後續 sendChangeOtp 能識別已通過 email 驗證
    // 這裡複用同一個 token 並延長 usedAt 的 grace period — 或另開一個短期 token
    // 為簡化，直接以 userId 建一筆新的「已通過」紀錄（使用 usedAt=now + short grace）
    const session = randomBytes(32).toString('hex');
    await this.prisma.emailVerification.create({
      data: {
        userId: record.userId,
        token: session,
        purpose: 'PHONE_CHANGE',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        // 這筆直接當作「已確認 email」的通行證使用，由 sendChangeOtp 消耗
      },
    });

    return { changeSession: session };
  }

  // ===== 換綁：送 OTP 到新手機（需先通過 email 驗證）=====
  async sendChangeOtp(userId: string, rawPhone: string, changeSession: string, ip?: string) {
    const session = await this.prisma.emailVerification.findUnique({ where: { token: changeSession } });
    if (
      !session ||
      session.userId !== userId ||
      session.purpose !== 'PHONE_CHANGE' ||
      session.usedAt ||
      session.expiresAt < new Date()
    ) {
      throw new BadRequestException({
        code: 'EMAIL_VERIFY_REQUIRED',
        message: '請先完成 Email 驗證',
      });
    }

    const phone = normalizeTwMobile(rawPhone);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('使用者不存在');
    if (user.phone === phone) {
      throw new BadRequestException({ code: 'SAME_PHONE', message: '新手機號碼與目前相同' });
    }

    const occupied = await this.prisma.user.findFirst({
      where: { phone, NOT: { id: userId } },
      select: { id: true },
    });
    if (occupied) throw new ConflictException('此手機號碼已被其他帳號綁定');

    await this.assertCooldown(userId, 'CHANGE');

    const code = generateOtp();
    const codeHash = hashOtp(code, userId);

    await this.prisma.$transaction([
      this.prisma.phoneVerification.updateMany({
        where: { userId, purpose: 'CHANGE', consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.phoneVerification.create({
        data: {
          userId,
          phone,
          codeHash,
          purpose: 'CHANGE',
          expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
          ip,
        },
      }),
    ]);

    const result = await this.sms.send({ phone, code });
    if (!result.success) {
      throw new BadRequestException({
        code: 'SMS_SEND_FAILED',
        message: '簡訊發送失敗，請稍後再試',
        detail: result.error,
      });
    }

    return { phone: maskPhone(phone), expiresInSeconds: OTP_TTL_MINUTES * 60 };
  }

  // ===== 換綁：驗證 OTP 並更新手機 =====
  async confirmChangeOtp(userId: string, code: string, changeSession: string) {
    const session = await this.prisma.emailVerification.findUnique({ where: { token: changeSession } });
    if (
      !session ||
      session.userId !== userId ||
      session.purpose !== 'PHONE_CHANGE' ||
      session.usedAt ||
      session.expiresAt < new Date()
    ) {
      throw new BadRequestException({ code: 'EMAIL_VERIFY_REQUIRED', message: '請先完成 Email 驗證' });
    }

    const record = await this.prisma.phoneVerification.findFirst({
      where: { userId, purpose: 'CHANGE', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new NotFoundException('找不到驗證紀錄，請重新取得驗證碼');

    if (record.expiresAt < new Date()) {
      throw new BadRequestException({ code: 'OTP_EXPIRED', message: '驗證碼已過期' });
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException({ code: 'OTP_TOO_MANY_ATTEMPTS', message: '嘗試次數過多' });
    }
    if (!verifyOtp(code, record.codeHash, userId)) {
      await this.prisma.phoneVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException({ code: 'OTP_INVALID', message: '驗證碼錯誤' });
    }

    await this.prisma.$transaction([
      this.prisma.phoneVerification.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.emailVerification.update({
        where: { id: session.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          phone: record.phone,
          phoneVerified: true,
          phoneVerifiedAt: new Date(),
          phoneChangedAt: new Date(),
        },
      }),
    ]);

    return { success: true };
  }

  private async assertCooldown(userId: string, purpose: 'BIND' | 'CHANGE') {
    const latest = await this.prisma.phoneVerification.findFirst({
      where: { userId, purpose },
      orderBy: { createdAt: 'desc' },
    });
    if (latest) {
      const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        throw new BadRequestException({
          code: 'RESEND_COOLDOWN',
          message: `請 ${Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed)} 秒後再試`,
        });
      }
    }
  }
}

function maskPhone(e164: string): string {
  // +886912345678 → +886 9****5678
  return e164.replace(/(\+886)(\d{1})(\d{4})(\d{3})/, '$1$2****$4');
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const masked = local.length <= 2 ? local[0] + '*' : local.slice(0, 2) + '*'.repeat(Math.max(1, local.length - 2));
  return `${masked}@${domain}`;
}
