export interface SmsSendParams {
  phone: string;              // E.164 格式（+8869xxxxxxxx）
  code: string;               // 驗證碼
  templateVars?: Record<string, string>;
}

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SmsProvider {
  send(params: SmsSendParams): Promise<SmsSendResult>;
}

export interface SmsProviderRuntimeConfig {
  apiEndpoint: string;
  apiKey: string;
  apiSecret?: string;
  senderId?: string;
  templateId?: string;
  extraConfig?: Record<string, any>;
}
