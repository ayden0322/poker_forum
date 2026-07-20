// 隊名中文顯示（結算通知用）：不准通知裸吐英文隊名（與前端 lib/team-meta 同一原則）。
// - 世界盃：查 world_cup_teams（name_en → name_zh），行程內快取一次
// - MLB：靜態映射（隊名穩定，30 隊）
// - 查不到 fallback 原文（優雅降級）

import { PrismaClient } from '@betting-forum/database';

const MLB_ZH: Record<string, string> = {
  'Arizona Diamondbacks': '響尾蛇', 'Atlanta Braves': '勇士', 'Baltimore Orioles': '金鶯',
  'Boston Red Sox': '紅襪', 'Chicago Cubs': '小熊', 'Chicago White Sox': '白襪',
  'Cincinnati Reds': '紅人', 'Cleveland Guardians': '守護者', 'Colorado Rockies': '洛磯',
  'Detroit Tigers': '老虎', 'Houston Astros': '太空人', 'Kansas City Royals': '皇家',
  'Los Angeles Angels': '天使', 'Los Angeles Dodgers': '道奇', 'Miami Marlins': '馬林魚',
  'Milwaukee Brewers': '釀酒人', 'Minnesota Twins': '雙城', 'New York Mets': '大都會',
  'New York Yankees': '洋基', 'Oakland Athletics': '運動家', 'Athletics': '運動家',
  'Philadelphia Phillies': '費城人', 'Pittsburgh Pirates': '海盜', 'San Diego Padres': '教士',
  'San Francisco Giants': '巨人', 'Seattle Mariners': '水手',
  'St. Louis Cardinals': '紅雀', 'St.Louis Cardinals': '紅雀',
  'Tampa Bay Rays': '光芒', 'Texas Rangers': '遊騎兵', 'Toronto Blue Jays': '藍鳥',
  'Washington Nationals': '國民',
};

let wcCache: Map<string, string> | null = null;

async function wcZh(prisma: Pick<PrismaClient, '$queryRaw'>): Promise<Map<string, string>> {
  if (wcCache) return wcCache;
  const rows = await prisma.$queryRaw<Array<{ name_en: string; name_zh: string | null }>>`
    SELECT name_en, name_zh FROM world_cup_teams`;
  wcCache = new Map(rows.filter((r) => r.name_zh).map((r) => [r.name_en, r.name_zh!]));
  return wcCache;
}

/** 英文隊名 → 中文顯示名（查不到回原文） */
export async function teamZh(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  sportType: string,
  nameEn: string,
): Promise<string> {
  if (sportType === 'baseball') return MLB_ZH[nameEn] ?? nameEn;
  const map = await wcZh(prisma);
  return map.get(nameEn) ?? nameEn;
}
