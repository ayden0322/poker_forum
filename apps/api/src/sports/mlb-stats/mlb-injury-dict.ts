/**
 * MLB 傷兵描述英中對照字典（零 AI 成本）
 * 解析 MLB Stats API 的 transactions.description 欄位
 */

/** IL 類型對照 */
export const IL_TYPE_DICT: Record<string, string> = {
  '10-day injured list': '10 日 IL',
  '15-day injured list': '15 日 IL',
  '60-day injured list': '60 日 IL',
  '7-day injured list': '7 日 IL',
  '7-day concussion injured list': '7 日腦震盪 IL',
  'paternity list': '陪產假',
  'bereavement list': '喪假',
  'restricted list': '限制名單',
  'suspended list': '禁賽名單',
};

/** 傷勢部位對照 */
export const INJURY_PART_DICT: Record<string, string> = {
  // 背部
  'lower back': '下背',
  'upper back': '上背',
  'back': '背部',
  // 肩膀
  'shoulder': '肩膀',
  'rotator cuff': '旋轉肌群',
  'labrum': '唇盂',
  // 手臂
  'elbow': '手肘',
  'ucl': 'UCL（尺側副韌帶）',
  'tommy john': 'Tommy John 手術',
  'forearm': '前臂',
  'tricep': '三頭肌',
  'bicep': '二頭肌',
  // 手腕與手
  'wrist': '手腕',
  'hand': '手掌',
  'finger': '手指',
  'thumb': '拇指',
  // 腿部
  'hamstring': '腿後肌',
  'quad': '股四頭肌',
  'quadriceps': '股四頭肌',
  'groin': '鼠蹊部',
  'hip': '髖部',
  'hip flexor': '髖屈肌',
  'calf': '小腿',
  'shin': '脛骨',
  // 足部
  'ankle': '腳踝',
  'foot': '腳部',
  'heel': '腳跟',
  'toe': '腳趾',
  'plantar fasciitis': '足底筋膜炎',
  'achilles': '阿基里斯腱',
  // 頭部與軀幹
  'head': '頭部',
  'concussion': '腦震盪',
  'neck': '頸部',
  'oblique': '腹斜肌',
  'rib': '肋骨',
  'chest': '胸部',
  'pectoral': '胸肌',
  // 其他
  'strain': '拉傷',
  'sprain': '扭傷',
  'tear': '撕裂',
  'fracture': '骨折',
  'surgery': '手術',
  'soreness': '痠痛',
  'inflammation': '發炎',
  'tendinitis': '肌腱炎',
  'illness': '生病',
  'covid-19': 'COVID-19',
  'covid': 'COVID',
  'personal reasons': '個人因素',
  'undisclosed': '原因未公開',
};

/** 動作對照 */
export const ACTION_DICT: Record<string, string> = {
  'placed on the': '被放入',
  'activated from the': '從...回歸',
  'reinstated from the': '從...回歸',
  'transferred to the': '轉至',
};

export interface ParsedTransaction {
  type: 'injury' | 'activation' | 'other';
  teamName?: string;
  playerName?: string;
  playerId?: number;
  ilType?: string;
  ilTypeZh?: string;
  injury?: string;
  injuryZh?: string;
  retroactive?: string;
  originalDescription: string;
  date: string;
}

/**
 * 解析交易描述
 * 範例：
 *   "Boston Red Sox placed LHP Chris Sale on the 10-day injured list retroactive to April 12. Lower back strain."
 *   "Los Angeles Dodgers activated RHP Yoshinobu Yamamoto from the 15-day injured list."
 */
export function parseTransaction(tx: any): ParsedTransaction {
  const desc: string = tx.description ?? '';
  const date: string = tx.date ?? '';

  const result: ParsedTransaction = {
    type: 'other',
    originalDescription: desc,
    date,
    playerId: tx.person?.id,
    playerName: tx.person?.fullName,
    teamName: tx.fromTeam?.name ?? tx.toTeam?.name,
  };

  // 判斷類型
  if (/placed .* on the .* injured list/i.test(desc)) {
    result.type = 'injury';
  } else if (/(activated|reinstated) .* from the .* injured list/i.test(desc)) {
    result.type = 'activation';
  } else if (/transferred .* to the .* injured list/i.test(desc)) {
    result.type = 'injury'; // 轉換 IL 類型
  }

  // 提取 IL 類型
  for (const [en, zh] of Object.entries(IL_TYPE_DICT)) {
    if (desc.toLowerCase().includes(en)) {
      result.ilType = en;
      result.ilTypeZh = zh;
      break;
    }
  }

  // 提取傷勢（通常在最後，句點分隔）
  // 範例：..."injured list retroactive to April 12. Lower back strain."
  const lastSentence = desc.split('.').pop()?.trim().toLowerCase() ?? '';
  if (lastSentence && lastSentence.length < 100 && result.type === 'injury') {
    result.injury = lastSentence;

    // 翻譯傷勢部位
    let zh = lastSentence;
    // 先換部位
    for (const [en, zhPart] of Object.entries(INJURY_PART_DICT)) {
      const re = new RegExp(`\\b${en.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (re.test(zh)) {
        zh = zh.replace(re, zhPart);
      }
    }
    // 常見組合後處理
    zh = zh.replace(/\s+/g, '');
    result.injuryZh = zh;
  }

  // 提取 retroactive 日期
  const retroMatch = desc.match(/retroactive to (\w+ \d+)/i);
  if (retroMatch) {
    result.retroactive = retroMatch[1];
  }

  return result;
}
