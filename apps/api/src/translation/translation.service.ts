import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';

/** 待翻譯實體的基本結構 */
export interface TranslatableEntity {
  apiId: number;
  nameEn: string;
  sport: string;
  entityType: EntityType;
  logo?: string;
  extra?: Record<string, unknown>;
}

export type EntityType = 'team' | 'player' | 'league' | 'coach' | 'venue' | 'country';

/** Claude API 回應結構 */
interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/** Claude Haiku 4.5 定價（USD per million tokens） */
const PRICING = {
  input: 1.0,
  output: 5.0,
};

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private readonly apiKey: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    // 支援 ANTHROPIC_API_KEY 或 CLAUDE_API_KEY 兩種命名
    this.apiKey =
      this.config.get<string>('ANTHROPIC_API_KEY') ||
      this.config.get<string>('CLAUDE_API_KEY') ||
      '';

    if (!this.apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY / CLAUDE_API_KEY 未設定，翻譯功能將無法使用');
    }
  }

  /** 查詢多個實體的翻譯，回傳 Map<apiId, Translation> */
  async getTranslations(entityType: EntityType, sport: string, apiIds: number[]) {
    if (apiIds.length === 0) return new Map();

    const translations = await this.prisma.translation.findMany({
      where: {
        entityType,
        sport,
        apiId: { in: apiIds },
      },
    });

    return new Map(translations.map((t) => [t.apiId, t]));
  }

  /** 找出尚未翻譯的實體 */
  async findMissing(entities: TranslatableEntity[]) {
    if (entities.length === 0) return [];

    // 按 entityType + sport 分組，逐一查詢
    const grouped = new Map<string, TranslatableEntity[]>();
    for (const e of entities) {
      const key = `${e.entityType}:${e.sport}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(e);
    }

    const missing: TranslatableEntity[] = [];
    for (const [key, list] of grouped) {
      const [entityType, sport] = key.split(':');
      const existing = await this.getTranslations(
        entityType as EntityType,
        sport,
        list.map((e) => e.apiId),
      );
      for (const e of list) {
        if (!existing.has(e.apiId)) missing.push(e);
      }
    }

    return missing;
  }

  /** 批次翻譯實體（送 Claude） */
  async translateBatch(
    entities: TranslatableEntity[],
    options: { triggeredBy?: 'cron' | 'manual' } = {},
  ): Promise<number> {
    if (entities.length === 0) return 0;
    if (!this.apiKey) {
      this.logger.error('API Key 未設定，跳過翻譯');
      return 0;
    }

    // 每批最多 50 個，避免 prompt 過大
    const BATCH_SIZE = 50;
    let totalTranslated = 0;

    for (let i = 0; i < entities.length; i += BATCH_SIZE) {
      const batch = entities.slice(i, i + BATCH_SIZE);
      try {
        const translated = await this.callClaudeForBatch(batch);
        totalTranslated += translated;
      } catch (err) {
        this.logger.error(`批次翻譯失敗（${i / BATCH_SIZE + 1}）：${err}`);
      }
    }

    return totalTranslated;
  }

  /** 呼叫 Claude 翻譯一批實體 */
  private async callClaudeForBatch(batch: TranslatableEntity[]): Promise<number> {
    if (batch.length === 0) return 0;

    const entityType = batch[0].entityType;
    const sport = batch[0].sport;

    const prompt = this.buildPrompt(batch);

    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as ClaudeResponse;
    const text = data.content[0]?.text?.trim() ?? '';

    // 記錄使用量
    const inputTokens = data.usage.input_tokens;
    const outputTokens = data.usage.output_tokens;
    const cost = (inputTokens * PRICING.input + outputTokens * PRICING.output) / 1_000_000;

    await this.prisma.translationUsage.create({
      data: {
        model: CLAUDE_MODEL,
        inputTokens,
        outputTokens,
        costUsd: cost,
        entityType,
        itemCount: batch.length,
        triggeredBy: 'cron',
      },
    });

    this.logger.log(
      `翻譯 ${batch.length} 個 ${entityType}（${sport}），tokens ${inputTokens}+${outputTokens}，成本 $${cost.toFixed(4)}`,
    );

    // 解析 JSON 回應
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.error(`Claude 回應解析失敗：${text.slice(0, 500)}`);
      return 0;
    }

    let parsed: Record<string, { name: string; short?: string; nickname?: string }>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      this.logger.error(`JSON 解析失敗：${err}`);
      return 0;
    }

    // 寫入 DB
    let count = 0;
    for (const entity of batch) {
      const translation = parsed[String(entity.apiId)];
      if (!translation?.name) continue;

      try {
        await this.prisma.translation.upsert({
          where: {
            entityType_apiId_sport: {
              entityType: entity.entityType,
              apiId: entity.apiId,
              sport: entity.sport,
            },
          },
          create: {
            entityType: entity.entityType,
            apiId: entity.apiId,
            sport: entity.sport,
            nameEn: entity.nameEn,
            nameZhTw: translation.name,
            shortName: translation.short,
            nickname: translation.nickname,
            logo: entity.logo,
            source: 'ai',
            verified: false,
            extra: entity.extra as any,
          },
          update: {
            nameZhTw: translation.name,
            shortName: translation.short,
            nickname: translation.nickname,
            logo: entity.logo,
          },
        });
        count++;
      } catch (err) {
        this.logger.error(`寫入翻譯失敗 (${entity.apiId} ${entity.nameEn})：${err}`);
      }
    }

    return count;
  }

  /** 建構 Prompt（針對不同實體類型） */
  private buildPrompt(batch: TranslatableEntity[]): string {
    const entityType = batch[0].entityType;
    const sport = batch[0].sport;

    const sportLabel = { football: '足球', basketball: '籃球', baseball: '棒球' }[sport] || sport;
    const typeLabel = {
      team: '球隊',
      player: '球員',
      league: '聯賽',
      coach: '教練',
      venue: '球場',
      country: '國家',
    }[entityType];

    const items = batch
      .map((e) => {
        const extra = e.extra ? ` (${JSON.stringify(e.extra)})` : '';
        return `${e.apiId}: ${e.nameEn}${extra}`;
      })
      .join('\n');

    return `你是專業的運動翻譯員，負責將${sportLabel}${typeLabel}的英文名稱翻譯為**台灣繁體中文慣用譯名**。

【翻譯規則】
1. 使用**台灣用語**，不要用中國大陸譯名
   - 例如：Lakers → 湖人（❌湖人人）
   - 例如：Manchester United → 曼聯（❌曼徹斯特聯）
   - 例如：Yomiuri Giants → 讀賣巨人
2. ${this.getRuleForType(entityType)}
3. **只回傳 JSON 格式**，不要加任何解釋文字
4. 格式範例：
\`\`\`json
{
  "1": { "name": "完整中文名", "short": "簡稱", "nickname": "暱稱（選填）" },
  "2": { "name": "..." }
}
\`\`\`

【要翻譯的${typeLabel}】（id: 英文名）
${items}

只回傳 JSON，不要其他文字：`;
  }

  /** 不同實體類型的翻譯規則 */
  private getRuleForType(entityType: EntityType): string {
    switch (entityType) {
      case 'team':
        return '球隊名稱提供簡稱（2-3 字），例如「洛杉磯湖人」簡稱「湖人」';
      case 'player':
        return '球員名字直接音譯或使用慣用翻譯，簡稱可給姓氏或暱稱';
      case 'league':
        return '聯賽名稱使用官方中文名，例如「英超」、「中華職棒」';
      case 'coach':
        return '教練名字直接音譯';
      case 'venue':
        return '球場名稱採音譯或意譯，例如「Yankee Stadium → 洋基球場」';
      case 'country':
        return '國家名稱使用台灣常用譯名';
      default:
        return '';
    }
  }

  /** 翻譯單一自由文字（帶 Redis 快取，後台手動觸發用） */
  async translateFreeText(
    text: string,
    context: string = '',
  ): Promise<{ translated: string; cached: boolean; cost: number }> {
    if (!this.apiKey) {
      return { translated: text, cached: false, cost: 0 };
    }

    // 先查 DB 有沒有翻過（用 hash 當 key）
    const hash = await this.hashText(text);
    const cached = await this.prisma.translation.findFirst({
      where: {
        entityType: 'freetext' as EntityType,
        apiId: 0,
        sport: 'text',
        nameEn: hash,
      },
    });

    if (cached) {
      return { translated: cached.nameZhTw, cached: true, cost: 0 };
    }

    // 呼叫 Claude 翻譯
    const prompt = `請將以下英文翻譯為台灣繁體中文${context ? `，情境：${context}` : ''}。
只回傳翻譯結果，不要加任何說明、不要加引號、不要加前後文字。

英文原文：
${text}

中文翻譯：`;

    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Claude API ${response.status}`);
    }

    const data = (await response.json()) as ClaudeResponse;
    const translated = data.content[0]?.text?.trim() ?? text;

    const inputTokens = data.usage.input_tokens;
    const outputTokens = data.usage.output_tokens;
    const cost = (inputTokens * PRICING.input + outputTokens * PRICING.output) / 1_000_000;

    // 記錄使用量
    await this.prisma.translationUsage.create({
      data: {
        model: CLAUDE_MODEL,
        inputTokens,
        outputTokens,
        costUsd: cost,
        entityType: 'freetext',
        itemCount: 1,
        triggeredBy: 'manual',
      },
    });

    // 存入 DB（用特殊 entityType）
    await this.prisma.translation.create({
      data: {
        entityType: 'freetext',
        apiId: 0,
        sport: 'text',
        nameEn: hash,
        nameZhTw: translated,
        source: 'ai',
      },
    });

    return { translated, cached: false, cost };
  }

  private async hashText(text: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(text).digest('hex').slice(0, 40);
  }

  /** 取得本月成本 */
  async getMonthlyCost() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const result = await this.prisma.translationUsage.aggregate({
      where: { date: { gte: startOfMonth } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
    });

    return {
      totalCostUsd: result._sum.costUsd ?? 0,
      totalInputTokens: result._sum.inputTokens ?? 0,
      totalOutputTokens: result._sum.outputTokens ?? 0,
      callCount: result._count,
    };
  }
}
