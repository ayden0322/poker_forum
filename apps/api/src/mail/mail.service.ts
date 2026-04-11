import { Injectable, Logger } from '@nestjs/common';

export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface MailProvider {
  send(params: SendMailParams): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private provider: MailProvider;

  constructor() {
    this.provider = this.buildProvider();
  }

  private buildProvider(): MailProvider {
    const driver = (process.env.MAIL_DRIVER || 'zsend').toLowerCase();
    if (driver === 'zsend') {
      return new ZSendMailProvider();
    }
    if (driver === 'log') {
      return new ConsoleMailProvider();
    }
    throw new Error(`[mail] 未知的 MAIL_DRIVER：${driver}`);
  }

  async send(params: SendMailParams) {
    try {
      const result = await this.provider.send(params);
      if (!result.success) {
        this.logger.warn(`寄信失敗 → ${params.to}：${result.error}`);
      }
      return result;
    } catch (error) {
      this.logger.error(`寄信異常 → ${params.to}`, error);
      return { success: false, error: (error as Error).message };
    }
  }

  async sendPhoneChangeVerification(to: string, confirmUrl: string, nickname: string) {
    return this.send({
      to,
      subject: '【博客邦】更換手機驗證確認',
      html: renderPhoneChangeTemplate({ confirmUrl, nickname }),
    });
  }
}

// ===== Provider: Zeabur ZSend =====
class ZSendMailProvider implements MailProvider {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly from: string;
  private readonly fromName: string;

  constructor() {
    this.endpoint = process.env.ZSEND_API_ENDPOINT || 'https://api.zsend.zeabur.com/v1/mail/send';
    this.apiKey = process.env.ZSEND_API_KEY || '';
    this.from = process.env.MAIL_FROM || 'noreply@example.com';
    this.fromName = process.env.MAIL_FROM_NAME || '博客邦';
    if (!this.apiKey) {
      // 不直接 throw，讓開發環境可繼續啟動；實際寄信時才會失敗
      // eslint-disable-next-line no-console
      console.warn('[mail] ZSEND_API_KEY 未設定，寄信會失敗');
    }
  }

  async send(params: SendMailParams) {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: { email: this.from, name: this.fromName },
        to: [{ email: params.to }],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { success: false, error: `ZSend ${res.status}: ${body}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
    return { success: true, messageId: data.id || data.messageId };
  }
}

// ===== Provider: Console（開發用）=====
class ConsoleMailProvider implements MailProvider {
  async send(params: SendMailParams) {
    // eslint-disable-next-line no-console
    console.log('[mail:log]', JSON.stringify(params, null, 2));
    return { success: true, messageId: 'log-' + Date.now() };
  }
}

// ===== 樣板 =====
function renderPhoneChangeTemplate(vars: { confirmUrl: string; nickname: string }) {
  return `
  <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222;">
    <h2 style="margin-top:0;">博客邦 — 更換手機驗證</h2>
    <p>哈囉 ${escapeHtml(vars.nickname)}，</p>
    <p>我們收到您更換手機號碼的請求。請點擊下方按鈕完成 Email 驗證，接著即可輸入新的手機號碼進行簡訊驗證。</p>
    <p style="margin:24px 0;">
      <a href="${vars.confirmUrl}" style="background:#0f62fe;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;display:inline-block;">確認更換手機</a>
    </p>
    <p style="font-size:12px;color:#666;">此連結 15 分鐘內有效。若非本人操作，請忽略此信並立即修改密碼。</p>
  </div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
