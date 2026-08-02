// 隊名中文顯示（結算通知用）：不准通知裸吐英文隊名（與前端 lib/team-meta 同一原則）。
// - 世界盃：查 world_cup_teams（name_en → name_zh），行程內快取一次
// - 棒球：靜態映射（隊名穩定）—— MLB 30 隊 + KBO 10 隊 + NPB 12 隊
// - 查不到 fallback 原文（優雅降級）
//
// ⚠️ key 一律用 API-Sports /teams 回的原始字串，不要自己補全名。
//    實測 NPB 是縮寫格式（'Fukuoka S. Hawks'、'Rakuten Gold. Eagles'），寫成全名會對不上。
// ⚠️ 容易混淆、別合併的組合：
//    Lotte Giants(韓·樂天巨人) ≠ Chiba Lotte Marines(日·千葉羅德)
//    Samsung Lions(三星獅) ≠ Seibu Lions(西武獅)
//    KIA Tigers(起亞虎) ≠ Hanshin Tigers(阪神虎) ≠ Detroit Tigers(老虎)
//    Yomiuri Giants(讀賣巨人) ≠ San Francisco Giants(巨人) ≠ Lotte Giants(樂天巨人)

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

/** KBO 韓國職棒 10 隊（+ 明星賽分隊）。key 來源：/teams?league=5 */
const KBO_ZH: Record<string, string> = {
  'Doosan Bears': '斗山熊', 'Hanwha Eagles': '韓華鷹', 'KIA Tigers': '起亞虎',
  'Kiwoom Heroes': '培證英雄', 'KT Wiz Suwon': 'KT巫師', 'LG Twins': 'LG雙子',
  'Lotte Giants': '樂天巨人', 'NC Dinos': 'NC恐龍', 'Samsung Lions': '三星獅',
  'SSG Landers': 'SSG登陸者',
  Dream: '夢想隊', Nanum: '分享隊', // 明星賽分隊
};

/** NPB 日本職棒 12 隊（+ 明星賽分隊）。key 來源：/teams?league=2（注意是縮寫格式） */
const NPB_ZH: Record<string, string> = {
  'Chiba Lotte Marines': '千葉羅德', 'Chunichi Dragons': '中日龍',
  'Fukuoka S. Hawks': '軟銀鷹', 'Hanshin Tigers': '阪神虎',
  'Hiroshima Carp': '廣島鯉魚', 'Nippon Ham Fighters': '日本火腿',
  'Orix Buffaloes': '歐力士猛牛', 'Rakuten Gold. Eagles': '樂天金鷲',
  'Seibu Lions': '西武獅', 'Yakult Swallows': '養樂多燕子',
  'Yokohama BayStars': '橫濱DeNA', 'Yomiuri Giants': '讀賣巨人',
  'Central league': '央聯明星', 'Pacific league': '洋聯明星', // 明星賽分隊
};

const BASEBALL_ZH: Record<string, string> = { ...MLB_ZH, ...KBO_ZH, ...NPB_ZH };

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
  if (sportType === 'baseball') return BASEBALL_ZH[nameEn] ?? nameEn;
  const map = await wcZh(prisma);
  return map.get(nameEn) ?? nameEn;
}
