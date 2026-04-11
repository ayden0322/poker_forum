import { BadRequestException } from '@nestjs/common';

const TW_LOCAL_MOBILE = /^09\d{8}$/;

/**
 * 將使用者輸入的台灣手機號碼正規化為 E.164（+8869xxxxxxxx）
 * 僅接受台灣門號（09 開頭 10 碼 或 +886 9 開頭）
 */
export function normalizeTwMobile(input: string): string {
  if (!input) throw new BadRequestException('請輸入手機號碼');
  const cleaned = input.replace(/[\s\-()]/g, '');

  // +8869xxxxxxxx
  if (/^\+8869\d{8}$/.test(cleaned)) return cleaned;

  // 8869xxxxxxxx（沒加 +）
  if (/^8869\d{8}$/.test(cleaned)) return '+' + cleaned;

  // 09xxxxxxxx
  if (TW_LOCAL_MOBILE.test(cleaned)) return '+886' + cleaned.slice(1);

  throw new BadRequestException('僅接受台灣手機號碼（格式：09xxxxxxxx）');
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
