/**
 * NPB / KBO 隊名靜態中譯表（API-Sports team id → 中文）
 *
 * 為什麼用靜態表而非 LLM 翻譯：
 *  - NPB 12 隊、KBO 10 隊皆固定，且有公認的官方/媒體中文譯名（如阪神虎、斗山熊）
 *  - 靜態表品質最高、零 API 成本、不會被 LLM 亂譯
 *  - DB translations 表優先，缺漏時用本表 fallback（見 baseball-common.service.getTeamTranslations）
 *
 * shortName 控制在 2~4 字，供賽程卡 / 戰績榜窄欄顯示。
 */
export interface StaticTeamName {
  nameZhTw: string;
  shortName: string;
}

/** NPB（日本職棒）— API-Sports leagueId = 2 */
const NPB_TEAM_NAMES: Record<number, StaticTeamName> = {
  55: { nameZhTw: '千葉羅德海洋', shortName: '羅德' },
  56: { nameZhTw: '中日龍', shortName: '中日' },
  57: { nameZhTw: '福岡軟銀鷹', shortName: '軟銀' },
  58: { nameZhTw: '阪神虎', shortName: '阪神' },
  59: { nameZhTw: '廣島東洋鯉魚', shortName: '廣島' },
  60: { nameZhTw: '北海道日本火腿鬥士', shortName: '日本火腿' },
  61: { nameZhTw: '歐力士野牛', shortName: '歐力士' },
  62: { nameZhTw: '東北樂天金鷲', shortName: '樂天金鷲' },
  63: { nameZhTw: '埼玉西武獅', shortName: '西武' },
  64: { nameZhTw: '東京養樂多燕子', shortName: '養樂多' },
  65: { nameZhTw: '橫濱DeNA灣星', shortName: '橫濱' },
  66: { nameZhTw: '讀賣巨人', shortName: '巨人' },
};

/** KBO（韓國職棒）— API-Sports leagueId = 5 */
const KBO_TEAM_NAMES: Record<number, StaticTeamName> = {
  88: { nameZhTw: '斗山熊', shortName: '斗山' },
  89: { nameZhTw: '韓華鷹', shortName: '韓華' },
  90: { nameZhTw: '起亞虎', shortName: '起亞' },
  91: { nameZhTw: 'KT巫師', shortName: 'KT' },
  92: { nameZhTw: '培證英雄', shortName: '培證' },
  93: { nameZhTw: 'LG雙子', shortName: 'LG' },
  94: { nameZhTw: '樂天巨人', shortName: '樂天' },
  95: { nameZhTw: 'NC恐龍', shortName: 'NC' },
  97: { nameZhTw: '三星獅', shortName: '三星' },
  647: { nameZhTw: 'SSG登陸者', shortName: 'SSG' },
};

/** 合併表：apiId → 中文名（NPB + KBO） */
export const STATIC_BASEBALL_TEAM_NAMES: Record<number, StaticTeamName> = {
  ...NPB_TEAM_NAMES,
  ...KBO_TEAM_NAMES,
};
