import { createHash } from 'crypto';
import { SmsProvider, SmsProviderRuntimeConfig, SmsSendParams, SmsSendResult } from '../sms-provider.interface';

/**
 * TA 國際簡訊平台 Provider
 *
 * API 文件版本：v3.2
 * 認證方式：簽名制（參數 ASCII 排序 → &拼接 → &key=apiKey → MD5/SHA256）
 * 支援普通簡訊與變量簡訊
 */
export class TaSmsProvider implements SmsProvider {
  constructor(private readonly config: SmsProviderRuntimeConfig) {}

  async send(params: SmsSendParams): Promise<SmsSendResult> {
    const { apiEndpoint, apiKey, apiSecret: username, extraConfig } = this.config;
    const signType = (extraConfig?.signType as string) || 'MD5';
    const spNumber = (extraConfig?.spNumber as string) || undefined;

    if (!username) {
      return { success: false, error: '缺少 username（通道編號），請至後台設定' };
    }

    // 號碼格式轉換：+886912345678 → 886912345678
    const phone = params.phone.replace(/^\+/, '');

    const timestamp = Date.now().toString();
    const nonceStr = this.generateNonceStr(20);

    // 使用變量簡訊：content 帶佔位符 {}，variables 帶驗證碼
    const content = '【博客邦】您的驗證碼為 {}，5 分鐘內有效，請勿轉告他人。';
    const phones = [{ phone, variables: [params.code] }];

    // 組簽名字串：按 ASCII 排序所有參數
    const signParams: Record<string, string> = {
      content,
      nonceStr,
      // phones 陣列按文件要求格式化（非 JSON）
      phones: `[{phone=${phone}, variables=[${params.code}]}]`,
      signType,
      timestamp,
      username,
    };
    if (spNumber) {
      signParams.spNumber = spNumber;
    }

    const sign = this.generateSign(signParams, apiKey, signType);

    const body: Record<string, unknown> = {
      username,
      nonceStr,
      timestamp,
      signType,
      sign,
      content,
      phones,
    };
    if (spNumber) {
      body.spNumber = spNumber;
    }

    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ta-version': 'v2',
        },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
        data?: { traceId?: number; msgIds?: Array<{ phone: string; msgId: string }> };
      };

      if (data.code !== '200') {
        return {
          success: false,
          error: `TA-SMS [${data.code}]: ${data.message || '未知錯誤'}`,
        };
      }

      const traceId = data.data?.traceId?.toString();
      const msgId = data.data?.msgIds?.[0]?.msgId;

      return {
        success: true,
        messageId: msgId || traceId,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 簽名規則（API 文件 Section 1）：
   * 1. 所有參數值按 ASCII key 排序，以 & 拼接
   * 2. 末尾加 &key=apiKey
   * 3. 對整個字串做 hash（MD5 / SHA256 等）
   */
  private generateSign(
    params: Record<string, string>,
    apiKey: string,
    signType: string,
  ): string {
    const sorted = Object.keys(params).sort();
    const parts = sorted.map((k) => `${k}=${params[k]}`);
    parts.push(`key=${apiKey}`);
    const raw = parts.join('&');

    const algo = this.mapSignAlgo(signType);
    return createHash(algo).update(raw, 'utf8').digest('hex');
  }

  private mapSignAlgo(signType: string): string {
    const map: Record<string, string> = {
      MD5: 'md5',
      SHA256: 'sha256',
      SHA224: 'sha224',
      SHA348: 'sha384', // 文件寫 SHA348 但實際應是 SHA384
      SHA512: 'sha512',
      SM3: 'sm3',
      RIPEMD160: 'ripemd160',
    };
    return map[signType.toUpperCase()] || 'md5';
  }

  private generateNonceStr(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
