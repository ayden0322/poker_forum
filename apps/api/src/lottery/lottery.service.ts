import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

// 彩種設定
const GAME_CONFIG = {
  LOTTO649: {
    name: '大樂透',
    apiPath: '/Lotto649Result',
    contentKey: 'lotto649Res',
    numberCount: 6,
    maxNumber: 49,
    hasSpecial: true,
    specialMax: 49,
    numberField: 'drawNumberSize',
    drawSchedule: '每週二、五 20:30',
  },
  SUPER_LOTTO: {
    name: '威力彩',
    apiPath: '/SuperLotto638Result',
    contentKey: 'superLotto638Res',
    numberCount: 6,
    maxNumber: 38,
    hasSpecial: true,
    specialMax: 8,
    numberField: 'drawNumberSize',
    drawSchedule: '每週一、四 20:30',
  },
  DAILY539: {
    name: '今彩539',
    apiPath: '/Daily539Result',
    contentKey: 'daily539Res',
    numberCount: 5,
    maxNumber: 39,
    hasSpecial: false,
    numberField: 'drawNumberSize',
    drawSchedule: '每日 21:00',
  },
  LOTTO1224: {
    name: '雙贏彩',
    apiPath: '/Lotto1224Result',
    contentKey: 'lotto1224Res',
    numberCount: 12,
    maxNumber: 24,
    hasSpecial: false,
    numberField: 'drawNumberSize',
    drawSchedule: '已於 2023/12/31 停售',
    discontinued: true,
  },
  LOTTO3D: {
    name: '3星彩',
    apiPath: '/3DResult',
    contentKey: 'lotto3DRes',
    numberCount: 3,
    maxNumber: 9,
    hasSpecial: false,
    numberField: 'drawNumberAppear',
    drawSchedule: '每日 21:00',
  },
  LOTTO4D: {
    name: '4星彩',
    apiPath: '/4DResult',
    contentKey: 'lotto4DRes',
    numberCount: 4,
    maxNumber: 9,
    hasSpecial: false,
    numberField: 'drawNumberAppear',
    drawSchedule: '每日 21:00',
  },
} as const;

export type GameType = keyof typeof GAME_CONFIG;
export { GAME_CONFIG };

const API_BASE = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery';

@Injectable()
export class LotteryService {
  private readonly logger = new Logger(LotteryService.name);

  constructor(private prisma: PrismaService) {}

  /** 從台灣彩券 API 抓取指定彩種的最新開獎結果 */
  async fetchFromExternal(gameType: GameType, month?: string) {
    const config = GAME_CONFIG[gameType];
    const now = new Date();
    const targetMonth = month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const url = `${API_BASE}${config.apiPath}?month=${targetMonth}&pageSize=31`;
    this.logger.log(`抓取 ${config.name}：${url}`);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const data = (await res.json()) as { rtCode: number; content?: Record<string, unknown[]> };

      if (data.rtCode !== 0 || !data.content) {
        this.logger.warn(`${config.name} API 回傳異常：rtCode=${data.rtCode}`);
        return [];
      }

      const results = data.content[config.contentKey] ?? [];
      return results as Record<string, unknown>[];
    } catch (err) {
      this.logger.error(`抓取 ${config.name} 失敗：${err}`);
      return [];
    }
  }

  /** 將外部 API 結果存入資料庫，回傳新增的筆數 */
  async syncResults(gameType: GameType): Promise<number> {
    const config = GAME_CONFIG[gameType];

    // 先抓當月，若無資料則補抓上個月
    let rawResults = await this.fetchFromExternal(gameType);
    if (rawResults.length === 0) {
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
      this.logger.log(`${config.name} 當月無資料，補抓上月 ${prevMonthStr}`);
      rawResults = await this.fetchFromExternal(gameType, prevMonthStr);
    }

    return this.persistRawResults(gameType, rawResults);
  }

  /** 補抓過去 N 個月的歷史開獎資料；可指定 endMonth (YYYY-MM) 為起算月份 */
  async backfillResults(
    gameType: GameType,
    months: number = 12,
    endMonth?: string,
  ): Promise<number> {
    const config = GAME_CONFIG[gameType];
    const anchor = endMonth
      ? new Date(`${endMonth}-01T00:00:00`)
      : new Date();
    let total = 0;

    for (let i = 0; i < months; i++) {
      const target = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      const monthStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
      try {
        const raw = await this.fetchFromExternal(gameType, monthStr);
        const added = await this.persistRawResults(gameType, raw);
        total += added;
        this.logger.log(`${config.name} 補抓 ${monthStr}：新增 ${added} 筆`);
      } catch (err) {
        this.logger.error(`${config.name} 補抓 ${monthStr} 失敗：${err}`);
      }
      // 避免短時間內打爆官方 API
      await new Promise((r) => setTimeout(r, 300));
    }

    return total;
  }

  /** 將原始 API 結果寫入資料庫（共用於 sync 與 backfill） */
  private async persistRawResults(
    gameType: GameType,
    rawResults: Record<string, unknown>[],
  ): Promise<number> {
    const config = GAME_CONFIG[gameType];
    let newCount = 0;

    for (const raw of rawResults) {
      const period = String(raw.period);

      // 檢查是否已存在
      const existing = await this.prisma.lotteryResult.findUnique({
        where: { gameType_period: { gameType, period } },
      });
      if (existing) continue;

      // 解析號碼（不同彩種使用不同欄位）
      const rawNumbers = (raw[config.numberField] as number[]) ?? [];
      let numbers: number[];
      let specialNum: number[] | undefined = undefined;

      if (gameType === 'LOTTO649' && rawNumbers.length === 7) {
        // 大樂透：前 6 正號 + 第 7 個特別號
        numbers = rawNumbers.slice(0, 6);
        specialNum = [rawNumbers[6]];
      } else if (gameType === 'SUPER_LOTTO' && rawNumbers.length === 7) {
        // 威力彩：前 6 第一區 + 第 7 個第二區
        numbers = rawNumbers.slice(0, 6);
        specialNum = [rawNumbers[6]];
      } else {
        numbers = rawNumbers;
      }

      // 解析獎金
      let jackpot: bigint | null = null;
      const prizeDetail: Record<string, { winners: number; amount: number }> = {};

      if (gameType === 'LOTTO649') {
        const ja = raw.jackpotAssign as Record<string, unknown> | undefined;
        if (ja) {
          jackpot = BigInt(Number(ja.lastPrize ?? ja.prize ?? 0));
          prizeDetail['頭獎'] = { winners: Number(ja.winnerCount ?? 0), amount: Number(ja.perPrize ?? 0) };
        }
      } else if (gameType === 'SUPER_LOTTO') {
        const ja = raw.super638JackpotAssign as Record<string, unknown> | undefined;
        if (ja) {
          jackpot = BigInt(Number(ja.lastPrize ?? ja.prize ?? 0));
          prizeDetail['頭獎'] = { winners: Number(ja.winnerCount ?? 0), amount: Number(ja.perPrize ?? 0) };
        }
      } else if (gameType === 'LOTTO3D') {
        const first = raw.lotto3DFirstAssign as Record<string, unknown> | undefined;
        if (first) {
          prizeDetail['正彩'] = { winners: Number(first.winnerCount ?? 0), amount: Number(first.perPrize ?? 0) };
        }
        const second = raw.lotto3DSecondAssign as Record<string, unknown> | undefined;
        if (second) {
          prizeDetail['組彩'] = { winners: Number(second.winnerCount ?? 0), amount: Number(second.perPrize ?? 0) };
        }
      } else if (gameType === 'LOTTO4D') {
        const first = raw.lotto4DFirstAssign as Record<string, unknown> | undefined;
        if (first) {
          prizeDetail['正彩'] = { winners: Number(first.winnerCount ?? 0), amount: Number(first.perPrize ?? 0) };
        }
        const second = raw.lotto4DSecondAssign as Record<string, unknown> | undefined;
        if (second) {
          prizeDetail['組彩'] = { winners: Number(second.winnerCount ?? 0), amount: Number(second.perPrize ?? 0) };
        }
      }

      const totalSales = raw.sellAmount ? BigInt(Number(raw.sellAmount)) : null;

      await this.prisma.lotteryResult.create({
        data: {
          gameType,
          period,
          drawDate: new Date(raw.lotteryDate as string),
          numbers,
          specialNum,
          jackpot,
          totalSales,
          prizeDetail: Object.keys(prizeDetail).length > 0 ? prizeDetail : undefined,
        },
      });

      newCount++;
      this.logger.log(`新增 ${config.name} 第 ${period} 期`);
    }

    return newCount;
  }

  /** 取得各彩種最新一期（含開獎時間與連槓資訊；自動排除已停售彩種） */
  async getLatest() {
    const gameTypes = (Object.keys(GAME_CONFIG) as GameType[]).filter(
      (gt) => !(GAME_CONFIG[gt] as { discontinued?: boolean }).discontinued,
    );
    const results: Record<string, unknown>[] = [];

    for (const gt of gameTypes) {
      const config = GAME_CONFIG[gt];
      const latest = await this.prisma.lotteryResult.findFirst({
        where: { gameType: gt },
        orderBy: { drawDate: 'desc' },
      });
      if (!latest) continue;

      // 計算連槓期數（僅大樂透、威力彩有累積獎金概念）
      let noWinnerStreak = 0;
      if (config.hasSpecial) {
        const recentDraws = await this.prisma.lotteryResult.findMany({
          where: { gameType: gt },
          orderBy: { drawDate: 'desc' },
          take: 50,
          select: { prizeDetail: true },
        });

        for (const draw of recentDraws) {
          const detail = draw.prizeDetail as Record<string, { winners: number }> | null;
          const winners = detail?.['頭獎']?.winners ?? -1;
          if (winners === 0) {
            noWinnerStreak++;
          } else {
            break;
          }
        }
      }

      results.push({
        ...latest,
        jackpot: latest.jackpot?.toString() ?? null,
        totalSales: latest.totalSales?.toString() ?? null,
        gameName: config.name,
        drawSchedule: config.drawSchedule,
        noWinnerStreak,
        discontinued: (config as { discontinued?: boolean }).discontinued ?? false,
      });
    }

    return results;
  }

  /** 查詢歷史開獎紀錄 */
  async getResults(gameType: GameType, limit: number = 30, page: number = 1): Promise<{ items: unknown[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.lotteryResult.findMany({
        where: { gameType },
        orderBy: { drawDate: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.lotteryResult.count({ where: { gameType } }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        jackpot: item.jackpot?.toString() ?? null,
        totalSales: item.totalSales?.toString() ?? null,
        gameName: GAME_CONFIG[gameType as GameType]?.name ?? gameType,
      })),
      total,
      page,
      limit,
    };
  }

  /** 號碼統計分析 */
  async getStats(gameType: GameType, range: number = 100) {
    const config = GAME_CONFIG[gameType];
    const results = await this.prisma.lotteryResult.findMany({
      where: { gameType },
      orderBy: { drawDate: 'desc' },
      take: range,
      select: { numbers: true, specialNum: true, period: true, drawDate: true },
    });

    if (results.length === 0) {
      return {
        totalDraws: 0,
        requestedRange: range,
        hasSpecial: config.hasSpecial,
        frequency: [],
        hot: [],
        cold: [],
        notDrawn: [],
        tailStats: [],
        specialFrequency: [],
        specialHot: [],
        specialCold: [],
        specialNotDrawn: [],
      };
    }

    // 號碼出現頻率（3星彩/4星彩從 0 開始）
    const freq: Record<number, number> = {};
    const startNum = (gameType === 'LOTTO3D' || gameType === 'LOTTO4D') ? 0 : 1;
    for (let i = startNum; i <= config.maxNumber; i++) freq[i] = 0;

    for (const r of results) {
      const nums = r.numbers as number[];
      for (const n of nums) {
        freq[n] = (freq[n] ?? 0) + 1;
      }
    }

    const frequency = Object.entries(freq)
      .map(([num, count]) => ({ number: Number(num), count }))
      .sort((a, b) => a.number - b.number);

    // 熱門：出現次數最多的前 10 名
    const sortedDesc = [...frequency].sort((a, b) => b.count - a.count);
    const hot = sortedDesc.slice(0, 10);

    // 冷門：只挑「曾經開出過」（count >= 1）的最後 10 名，並依次數由少到多排序
    const drawn = frequency.filter((f) => f.count > 0);
    const cold = [...drawn].sort((a, b) => a.count - b.count).slice(0, 10);

    // 從未開出的號碼（單獨列出，避免污染冷門統計）
    const notDrawn = frequency.filter((f) => f.count === 0).map((f) => f.number);

    // 尾數分布
    const tailFreq: Record<number, number> = {};
    for (let i = 0; i <= 9; i++) tailFreq[i] = 0;
    for (const r of results) {
      const nums = r.numbers as number[];
      for (const n of nums) {
        tailFreq[n % 10]++;
      }
    }
    const tailStats = Object.entries(tailFreq)
      .map(([tail, count]) => ({ tail: Number(tail), count }))
      .sort((a, b) => a.tail - b.tail);

    // 特別號統計（僅大樂透、威力彩有）
    let specialFrequency: { number: number; count: number }[] = [];
    let specialHot: { number: number; count: number }[] = [];
    let specialCold: { number: number; count: number }[] = [];
    let specialNotDrawn: number[] = [];

    if (config.hasSpecial && 'specialMax' in config) {
      const specialMax = (config as { specialMax: number }).specialMax;
      const sFreq: Record<number, number> = {};
      for (let i = 1; i <= specialMax; i++) sFreq[i] = 0;

      for (const r of results) {
        const sNums = (r.specialNum as number[] | null) ?? [];
        for (const n of sNums) {
          if (n >= 1 && n <= specialMax) {
            sFreq[n] = (sFreq[n] ?? 0) + 1;
          }
        }
      }

      specialFrequency = Object.entries(sFreq)
        .map(([num, count]) => ({ number: Number(num), count }))
        .sort((a, b) => a.number - b.number);

      const sSortedDesc = [...specialFrequency].sort((a, b) => b.count - a.count);
      specialHot = sSortedDesc.slice(0, Math.min(5, specialFrequency.length));

      const sDrawn = specialFrequency.filter((f) => f.count > 0);
      specialCold = [...sDrawn].sort((a, b) => a.count - b.count).slice(0, 5);
      specialNotDrawn = specialFrequency.filter((f) => f.count === 0).map((f) => f.number);
    }

    return {
      totalDraws: results.length,
      requestedRange: range,
      hasSpecial: config.hasSpecial,
      frequency,
      hot,
      cold,
      notDrawn,
      tailStats,
      specialFrequency,
      specialHot,
      specialCold,
      specialNotDrawn,
    };
  }

  /** 對獎功能 */
  async checkNumbers(gameType: GameType, userNumbers: number[], userSpecial?: number): Promise<Record<string, unknown>> {
    const config = GAME_CONFIG[gameType];
    const latest = await this.prisma.lotteryResult.findFirst({
      where: { gameType },
      orderBy: { drawDate: 'desc' },
    });

    if (!latest) return { matched: false, message: '尚無開獎資料' };

    const drawNumbers = latest.numbers as number[];
    const drawSpecial = latest.specialNum ? (latest.specialNum as number[])[0] : null;

    const matchedNums = userNumbers.filter((n) => drawNumbers.includes(n));
    const matchCount = matchedNums.length;
    const specialMatched = config.hasSpecial && drawSpecial != null && userSpecial === drawSpecial;

    // 中獎判定
    let prize = '';
    let prizeLevel = 0;

    if (gameType === 'LOTTO649') {
      if (matchCount === 6) { prize = '頭獎'; prizeLevel = 1; }
      else if (matchCount === 5 && specialMatched) { prize = '貳獎'; prizeLevel = 2; }
      else if (matchCount === 5) { prize = '參獎'; prizeLevel = 3; }
      else if (matchCount === 4 && specialMatched) { prize = '肆獎'; prizeLevel = 4; }
      else if (matchCount === 4) { prize = '伍獎'; prizeLevel = 5; }
      else if (matchCount === 3 && specialMatched) { prize = '陸獎'; prizeLevel = 6; }
      else if (matchCount === 3) { prize = '柒獎'; prizeLevel = 7; }
      else if (matchCount === 2 && specialMatched) { prize = '普獎'; prizeLevel = 8; }
    } else if (gameType === 'SUPER_LOTTO') {
      if (matchCount === 6 && specialMatched) { prize = '頭獎'; prizeLevel = 1; }
      else if (matchCount === 6) { prize = '貳獎'; prizeLevel = 2; }
      else if (matchCount === 5 && specialMatched) { prize = '參獎'; prizeLevel = 3; }
      else if (matchCount === 5) { prize = '肆獎'; prizeLevel = 4; }
      else if (matchCount === 4 && specialMatched) { prize = '伍獎'; prizeLevel = 5; }
      else if (matchCount === 4) { prize = '陸獎'; prizeLevel = 6; }
      else if (matchCount === 3 && specialMatched) { prize = '柒獎'; prizeLevel = 7; }
      else if (matchCount === 2 && specialMatched) { prize = '捌獎'; prizeLevel = 8; }
      else if (matchCount === 3) { prize = '玖獎'; prizeLevel = 9; }
      else if (matchCount === 1 && specialMatched) { prize = '拾獎'; prizeLevel = 10; }
    } else if (gameType === 'DAILY539') {
      if (matchCount === 5) { prize = '頭獎'; prizeLevel = 1; }
      else if (matchCount === 4) { prize = '貳獎'; prizeLevel = 2; }
      else if (matchCount === 3) { prize = '參獎'; prizeLevel = 3; }
      else if (matchCount === 2) { prize = '肆獎'; prizeLevel = 4; }
    } else if (gameType === 'LOTTO1224') {
      if (matchCount === 12) { prize = '頭獎'; prizeLevel = 1; }
      else if (matchCount === 11) { prize = '貳獎'; prizeLevel = 2; }
      else if (matchCount === 10) { prize = '參獎'; prizeLevel = 3; }
      else if (matchCount === 9) { prize = '肆獎'; prizeLevel = 4; }
      else if (matchCount === 0) { prize = '伍獎'; prizeLevel = 5; }
    } else if (gameType === 'LOTTO3D') {
      // 3星彩：正彩（順序完全相同）、組彩（數字相同不論順序）、對彩（任2碼相同且順序相同）
      const isExactMatch = drawNumbers.length === userNumbers.length &&
        drawNumbers.every((n, i) => n === userNumbers[i]);
      const isSorted = [...drawNumbers].sort().join(',') === [...userNumbers].sort().join(',');

      if (isExactMatch) { prize = '正彩'; prizeLevel = 1; }
      else if (isSorted) { prize = '組彩'; prizeLevel = 2; }
    } else if (gameType === 'LOTTO4D') {
      // 4星彩：正彩（順序完全相同）、組彩（數字相同不論順序）
      const isExactMatch = drawNumbers.length === userNumbers.length &&
        drawNumbers.every((n, i) => n === userNumbers[i]);
      const isSorted = [...drawNumbers].sort().join(',') === [...userNumbers].sort().join(',');

      if (isExactMatch) { prize = '正彩'; prizeLevel = 1; }
      else if (isSorted) { prize = '組彩'; prizeLevel = 2; }
    }

    return {
      matched: prizeLevel > 0,
      drawResult: {
        ...latest,
        jackpot: latest.jackpot?.toString() ?? null,
        totalSales: latest.totalSales?.toString() ?? null,
        gameName: config.name,
      },
      userNumbers,
      userSpecial: userSpecial ?? null,
      matchedNumbers: matchedNums,
      matchCount,
      specialMatched,
      prize: prize || null,
      prizeLevel,
      message: prizeLevel > 0
        ? `恭喜中${prize}！`
        : '很可惜，本期未中獎，下次再接再厲！',
    };
  }

  /** 產生自動發文的內容 */
  generatePostContent(gameType: GameType, result: {
    period: string;
    numbers: unknown;
    specialNum: unknown;
    jackpot: bigint | null;
    totalSales: bigint | null;
    prizeDetail: unknown;
  }) {
    const config = GAME_CONFIG[gameType];
    const numbers = (result.numbers as number[]).join(', ');
    const special = result.specialNum ? (result.specialNum as number[]).join(', ') : null;

    const jackpotStr = result.jackpot
      ? `NT$ ${Number(result.jackpot).toLocaleString()}`
      : '資料待更新';
    const salesStr = result.totalSales
      ? `NT$ ${Number(result.totalSales).toLocaleString()}`
      : '資料待更新';

    let content = `🎱 **開獎號碼**：${numbers}`;
    if (special) {
      content += ` + 特別號 ${special}`;
    }
    content += '\n\n';
    content += `💰 **頭獎獎金**：${jackpotStr}\n`;
    content += `📊 **本期銷售額**：${salesStr}\n`;

    content += '\n---\n\n*本文由系統自動發佈，歡迎在下方討論！*';

    return {
      title: `【${config.name}】第 ${result.period} 期 開獎結果`,
      content,
    };
  }
}
