/**
 * 彩種 metadata（前端靜態定義）
 *
 * 包含：
 * - icon 對應插畫路徑
 * - 球數規則（用於日期 seed 隨機選號）
 * - 跨彩種比較預設值（中獎機率等）
 *
 * 注意：開獎日期、累積金額等動態資料來自 /lottery/latest API
 */

export interface LotteryMeta {
  type: string; // gameType from API
  shortName: string; // 大樂透
  fullName: string;
  emoji: string; // fallback when icon is missing
  icon?: string; // public 路徑
  href: string;
  schedule: string;
  scheduleDays: number[]; // 0=日 1=一 ... 每週開獎星期
  drawTime: string; // HH:MM 開獎時間
  ballRange: { main: [number, number]; mainCount: number; special?: [number, number]; specialCount?: number };
  ticketPrice: number;
  oddsTopPrize: string;
}

/** 計算下次開獎時間（台灣時區） */
export function nextDrawTime(meta: LotteryMeta, refDate?: Date): Date {
  const now = refDate ?? new Date();
  const [hh, mm] = meta.drawTime.split(':').map(Number);
  // 找未來 14 天內第一個符合 scheduleDays 且時間未過的日期
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    if (!meta.scheduleDays.includes(d.getDay())) continue;
    d.setHours(hh, mm, 0, 0);
    if (d.getTime() > now.getTime()) return d;
  }
  // fallback：14 天後
  const fallback = new Date(now);
  fallback.setDate(now.getDate() + 14);
  return fallback;
}

/**
 * 與後端 LotteryGameType enum 對應的 7 個彩種
 * 後端 game type → frontend metadata
 */
export const LOTTERY_META: LotteryMeta[] = [
  {
    type: 'LOTTO649',
    shortName: '大樂透',
    fullName: '大樂透 LOTTO 6/49',
    emoji: '🎰',
    icon: '/lottery-icons/lotto649.png',
    href: '/board/lotto649',
    schedule: '每週二、五 20:30',
    scheduleDays: [2, 5],
    drawTime: '20:30',
    ballRange: { main: [1, 49], mainCount: 6, special: [1, 49], specialCount: 1 },
    ticketPrice: 50,
    oddsTopPrize: '1 / 13,983,816',
  },
  {
    type: 'SUPER_LOTTO',
    shortName: '威力彩',
    fullName: '威力彩 SUPER LOTTO',
    emoji: '⚡',
    icon: '/lottery-icons/super-lotto.png',
    href: '/board/super-lotto',
    schedule: '每週一、四 20:30',
    scheduleDays: [1, 4],
    drawTime: '20:30',
    ballRange: { main: [1, 38], mainCount: 6, special: [1, 8], specialCount: 1 },
    ticketPrice: 100,
    oddsTopPrize: '1 / 22,085,448',
  },
  {
    type: 'DAILY539',
    shortName: '今彩 539',
    fullName: '今彩 539 DAILY 5/39',
    emoji: '💵',
    icon: '/lottery-icons/daily-cash.png',
    href: '/board/daily-cash',
    schedule: '每日 20:30（週日除外）',
    scheduleDays: [1, 2, 3, 4, 5, 6],
    drawTime: '20:30',
    ballRange: { main: [1, 39], mainCount: 5 },
    ticketPrice: 50,
    oddsTopPrize: '1 / 575,757',
  },
  {
    type: 'LOTTO1224',
    shortName: '雙贏彩',
    fullName: '雙贏彩 LOTTO 12/24',
    emoji: '🎯',
    icon: '/lottery-icons/lotto1224.png',
    href: '/board/lotto1224',
    schedule: '每日 20:30',
    scheduleDays: [0, 1, 2, 3, 4, 5, 6],
    drawTime: '20:30',
    ballRange: { main: [1, 24], mainCount: 12 },
    ticketPrice: 100,
    oddsTopPrize: '1 / 2,704,156',
  },
  {
    type: 'LOTTO3D',
    shortName: '3 星彩',
    fullName: '3 星彩 LOTTO 3D',
    emoji: '3️⃣',
    icon: '/lottery-icons/star-lotto.png',
    href: '/board/star-lotto',
    schedule: '每日 20:30',
    scheduleDays: [1, 2, 3, 4, 5, 6],
    drawTime: '20:30',
    ballRange: { main: [0, 9], mainCount: 3 },
    ticketPrice: 50,
    oddsTopPrize: '1 / 1,000',
  },
  {
    type: 'LOTTO4D',
    shortName: '4 星彩',
    fullName: '4 星彩 LOTTO 4D',
    emoji: '4️⃣',
    icon: '/lottery-icons/lotto4d.png',
    href: '/board/star-lotto',
    schedule: '每日 20:30',
    scheduleDays: [1, 2, 3, 4, 5, 6],
    drawTime: '20:30',
    ballRange: { main: [0, 9], mainCount: 4 },
    ticketPrice: 50,
    oddsTopPrize: '1 / 10,000',
  },
];

/** 把後端 board slug 對應到 LotteryMeta */
export function getMetaByBoardSlug(slug: string): LotteryMeta | undefined {
  const map: Record<string, string> = {
    lotto649: 'LOTTO649',
    'super-lotto': 'SUPER_LOTTO',
    'daily-cash': 'DAILY539',
    lotto1224: 'LOTTO1224',
    'star-lotto': 'LOTTO3D', // 預設給 3 星彩
  };
  const type = map[slug];
  return type ? LOTTERY_META.find((m) => m.type === type) : undefined;
}

/** 由 gameType 取 meta */
export function getMetaByType(type: string): LotteryMeta | undefined {
  return LOTTERY_META.find((m) => m.type === type);
}
