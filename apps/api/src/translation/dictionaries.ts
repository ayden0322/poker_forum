/**
 * 硬編碼翻譯字典（零 AI 成本）
 * 涵蓋 API-Sports 回傳的常見固定詞彙
 */

/** 比賽狀態（跨運動通用） */
export const STATUS_DICT: Record<string, string> = {
  // 共用
  'Not Started': '尚未開始',
  'NS': '尚未開始',
  'Match Finished': '比賽結束',
  'FT': '已結束',
  'Match Postponed': '比賽延期',
  'PST': '延期',
  'Match Cancelled': '比賽取消',
  'CANC': '取消',
  'Match Suspended': '比賽暫停',
  'SUSP': '暫停',
  'Abandoned': '比賽放棄',
  'ABD': '放棄',
  'Awarded': '判定勝負',
  'AWD': '判定勝負',
  'Technical Loss': '技術性判負',
  'WO': '不戰而勝',
  'TBD': '時間未定',
  'LIVE': '進行中',
  // 足球
  'First Half': '上半場',
  '1H': '上半場',
  'Halftime': '中場休息',
  'HT': '中場',
  'Second Half': '下半場',
  '2H': '下半場',
  'Extra Time': '延長賽',
  'ET': '延長賽',
  'Break Time': '中場空檔',
  'BT': '中場空檔',
  'Penalty In Progress': '點球大戰',
  'P': '點球',
  'Match Finished After Extra Time': '延長賽後結束',
  'AET': '延長賽結束',
  'Match Finished After Penalty': '點球大戰後結束',
  'PEN': '點球結束',
  // 籃球
  'Quarter 1': '第一節',
  'Q1': '第一節',
  'Quarter 2': '第二節',
  'Q2': '第二節',
  'Quarter 3': '第三節',
  'Q3': '第三節',
  'Quarter 4': '第四節',
  'Q4': '第四節',
  'Overtime': '延長賽',
  'OT': '延長賽',
  // 棒球
  'Inning 1': '一局',
  'IN1': '一局',
  'Inning 2': '二局',
  'IN2': '二局',
  'Inning 3': '三局',
  'IN3': '三局',
  'Inning 4': '四局',
  'IN4': '四局',
  'Inning 5': '五局',
  'IN5': '五局',
  'Inning 6': '六局',
  'IN6': '六局',
  'Inning 7': '七局',
  'IN7': '七局',
  'Inning 8': '八局',
  'IN8': '八局',
  'Inning 9': '九局',
  'IN9': '九局',
  'After Over Time': '延長賽結束',
  'AOT': '延長賽結束',
};

/** 足球事件類型 */
export const FOOTBALL_EVENT_DICT: Record<string, string> = {
  'Goal': '進球',
  'Normal Goal': '進球',
  'Own Goal': '烏龍球',
  'Penalty': '點球',
  'Missed Penalty': '射失點球',
  'Card': '吃牌',
  'Yellow Card': '黃牌',
  'Red Card': '紅牌',
  'Second Yellow card': '第二張黃牌',
  'Subst': '換人',
  'Substitution': '換人',
  'Substitution 1': '第一次換人',
  'Substitution 2': '第二次換人',
  'Substitution 3': '第三次換人',
  'Var': 'VAR 回看',
  'Goal Disallowed': '進球無效',
  'Goal cancelled': '進球取消',
  'Penalty confirmed': '點球確認',
};

/** 足球傷兵類型 */
export const INJURY_DICT: Record<string, string> = {
  'Missing Fixture': '缺陣',
  'Questionable': '存疑',
  'Knee Injury': '膝蓋傷勢',
  'Knee': '膝蓋',
  'Hamstring': '大腿後肌',
  'Ankle': '腳踝',
  'Shoulder': '肩膀',
  'Groin': '鼠蹊部',
  'Calf': '小腿',
  'Thigh': '大腿',
  'Back': '背部',
  'Foot': '腳部',
  'Hand': '手部',
  'Wrist': '手腕',
  'Elbow': '手肘',
  'Head': '頭部',
  'Neck': '頸部',
  'Concussion': '腦震盪',
  'Illness': '生病',
  'Suspended': '停賽',
  'Coach Decision': '教練決定',
  'National selection': '國家隊徵召',
  'Rest': '輪休',
  'Unknown': '原因不明',
};

/** 足球統計項目 */
export const FOOTBALL_STAT_DICT: Record<string, string> = {
  'Shots on Goal': '射正',
  'Shots off Goal': '射偏',
  'Total Shots': '總射門',
  'Blocked Shots': '被擋下射門',
  'Shots insidebox': '禁區內射門',
  'Shots outsidebox': '禁區外射門',
  'Fouls': '犯規',
  'Corner Kicks': '角球',
  'Offsides': '越位',
  'Ball Possession': '控球率',
  'Yellow Cards': '黃牌數',
  'Red Cards': '紅牌數',
  'Goalkeeper Saves': '門將撲救',
  'Total passes': '總傳球',
  'Passes accurate': '成功傳球',
  'Passes %': '傳球成功率',
  'Tackles': '鏟球',
  'Interceptions': '攔截',
  'Duels won': '對抗贏得',
};

/** 籃球統計項目 */
export const BASKETBALL_STAT_DICT: Record<string, string> = {
  'Points': '得分',
  'Rebounds': '籃板',
  'Offensive Rebounds': '進攻籃板',
  'Defensive Rebounds': '防守籃板',
  'Assists': '助攻',
  'Steals': '抄截',
  'Blocks': '火鍋',
  'Turnovers': '失誤',
  'Fouls': '犯規',
  'Field Goals Made': '投籃命中',
  'Field Goals Attempted': '投籃出手',
  'Field Goal %': '投籃命中率',
  '3-Point Made': '三分命中',
  '3-Point Attempted': '三分出手',
  '3-Point %': '三分命中率',
  'Free Throws Made': '罰球命中',
  'Free Throws Attempted': '罰球出手',
  'Free Throws %': '罰球命中率',
  'Minutes': '上場時間',
};

/** 棒球統計項目 */
export const BASEBALL_STAT_DICT: Record<string, string> = {
  // 打擊
  'At Bats': '打數',
  'AB': '打數',
  'Runs': '得分',
  'R': '得分',
  'Hits': '安打',
  'H': '安打',
  'Doubles': '二壘安打',
  '2B': '二壘安打',
  'Triples': '三壘安打',
  '3B': '三壘安打',
  'Home Runs': '全壘打',
  'HR': '全壘打',
  'Runs Batted In': '打點',
  'RBI': '打點',
  'Stolen Bases': '盜壘',
  'SB': '盜壘',
  'Walks': '保送',
  'BB': '保送',
  'Strikeouts': '三振',
  'SO': '三振',
  'Batting Average': '打擊率',
  'AVG': '打擊率',
  'On-Base Percentage': '上壘率',
  'OBP': '上壘率',
  'Slugging Percentage': '長打率',
  'SLG': '長打率',
  'OPS': '整體攻擊指數',
  // 投球
  'Innings Pitched': '投球局數',
  'IP': '投球局數',
  'Earned Runs': '自責分',
  'ER': '自責分',
  'Earned Run Average': '防禦率',
  'ERA': '防禦率',
  'WHIP': '每局被上壘率',
  'Strikeouts Pitcher': '投手三振',
  'K': '三振',
  'Wins': '勝場',
  'W': '勝',
  'Losses': '敗場',
  'L': '敗',
  'Saves': '救援',
  'SV': '救援',
  'Holds': '中繼',
  'HLD': '中繼',
  'Quality Starts': '優質先發',
  'QS': '優質先發',
};

/** 球員位置 */
export const POSITION_DICT: Record<string, string> = {
  // 足球
  'Goalkeeper': '守門員',
  'Defender': '後衛',
  'Midfielder': '中場',
  'Attacker': '前鋒',
  'Forward': '前鋒',
  // 籃球
  'G': '後衛',
  'PG': '控球後衛',
  'SG': '得分後衛',
  'F': '前鋒',
  'SF': '小前鋒',
  'PF': '大前鋒',
  'C': '中鋒',
  'G-F': '鋒衛搖擺人',
  'F-C': '鋒線內線搖擺人',
  // 棒球
  'Pitcher': '投手',
  'P': '投手',
  'Catcher': '捕手',
  'First Baseman': '一壘手',
  '1B': '一壘手',
  'Second Baseman': '二壘手',
  '2B': '二壘手',
  'Third Baseman': '三壘手',
  '3B': '三壘手',
  'Shortstop': '游擊手',
  'SS': '游擊手',
  'Left Fielder': '左外野手',
  'LF': '左外野手',
  'Center Fielder': '中外野手',
  'CF': '中外野手',
  'Right Fielder': '右外野手',
  'RF': '右外野手',
  'Designated Hitter': '指定打擊',
  'DH': '指定打擊',
  'Outfielder': '外野手',
  'Infielder': '內野手',
};

/**
 * 轉換英文詞彙為中文（找不到對應就回傳原文）
 */
export function translateDict(text: string, dict: Record<string, string>): string {
  if (!text) return text;
  return dict[text] ?? text;
}

/**
 * 整合型翻譯器，嘗試多個字典
 */
export function translateAny(text: string): string {
  if (!text) return text;
  const allDicts = [
    STATUS_DICT,
    FOOTBALL_EVENT_DICT,
    INJURY_DICT,
    FOOTBALL_STAT_DICT,
    BASKETBALL_STAT_DICT,
    BASEBALL_STAT_DICT,
    POSITION_DICT,
  ];
  for (const dict of allDicts) {
    if (dict[text]) return dict[text];
  }
  return text;
}
