import { SmsProvider, SmsProviderRuntimeConfig, SmsSendParams, SmsSendResult } from '../sms-provider.interface';

/**
 * 通用台灣簡訊服務商 provider
 *
 * 預設採用 Bearer Token 認證 + JSON payload 的格式。
 * 當你拿到廠商的 API 文件後，調整下方 send() 的 request body 與 header 即可。
 *
 * 廠商資訊從資料庫 SmsProviderConfig 讀取（後台可編輯），不需改動程式碼與環境變數。
 */
export class CustomTwSmsProvider implements SmsProvider {
  constructor(private readonly config: SmsProviderRuntimeConfig) {}

  async send(params: SmsSendParams): Promise<SmsSendResult> {
    const { apiEndpoint, apiKey, apiSecret, senderId, templateId, extraConfig } = this.config;

    // 組 message 內文（若廠商採樣板制，只需傳 templateId + 變數）
    const message = `【博客邦】您的驗證碼為 ${params.code}，5 分鐘內有效，請勿轉告他人。`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    if (apiSecret) {
      headers['X-Api-Secret'] = apiSecret;
    }

    const body: Record<string, any> = {
      to: params.phone,
      message,
      ...(senderId ? { sender: senderId } : {}),
      ...(templateId ? { templateId, variables: { code: params.code, ...(params.templateVars || {}) } } : {}),
      ...(extraConfig || {}),
    };

    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { success: false, error: `SMS ${res.status}: ${errText}` };
      }

      const data = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
      return { success: true, messageId: data.id || data.messageId };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}
