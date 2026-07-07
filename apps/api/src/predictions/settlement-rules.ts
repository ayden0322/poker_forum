// P幣競猜 — 結算規則（純函式，單元測試在 settlement-rules.spec.ts）
// 規格 §4.3 賽況白名單：映射表以外的任何 status → 不動作 + 告警（最容易漏的就是
// default case 把沒見過的狀態當完賽結掉）。

export type StatusClass =
  | 'FINAL' // 完賽 → 進入 grace period，期滿結算
  | 'VOID' // 取消/腰斬/技術判定 → 全額退款
  | 'FREEZE' // 延賽 → 凍結（期滿或確認改日才退款）
  | 'WAIT' // 未開賽/進行中 → 不動作
  | 'UNKNOWN'; // 白名單外 → 不動作 + 告警

const FOOTBALL_MAP: Record<string, StatusClass> = {
  // 完賽（FT=90分鐘、AET=延長賽後、PEN=PK後；1X2/大小分皆以 90 分鐘比分結算，取 score.fulltime）
  FT: 'FINAL', AET: 'FINAL', PEN: 'FINAL',
  // 取消/腰斬/技術判定（AWD 判給、WO 不戰而勝：比分非競技產生 → 一律退款 + 告警由 service 記）
  CANC: 'VOID', ABD: 'VOID', AWD: 'VOID', WO: 'VOID',
  // 延賽
  PST: 'FREEZE',
  // 未開賽/進行中
  NS: 'WAIT', TBD: 'WAIT', '1H': 'WAIT', HT: 'WAIT', '2H': 'WAIT',
  ET: 'WAIT', BT: 'WAIT', P: 'WAIT', SUSP: 'WAIT', INT: 'WAIT', LIVE: 'WAIT',
};

const BASEBALL_MAP: Record<string, StatusClass> = {
  FT: 'FINAL',
  CANC: 'VOID', ABD: 'VOID',
  POST: 'FREEZE', INTR: 'FREEZE', // 中斷（可能擇日續打）比照延賽凍結
  NS: 'WAIT',
};

/** API status → 結算分類。棒球 IN1~IN9/延長局（INx）視為進行中。 */
export function classifyStatus(sportType: 'football' | 'baseball', status: string): StatusClass {
  if (sportType === 'baseball' && /^IN\d+$/.test(status)) return 'WAIT';
  const cls = (sportType === 'football' ? FOOTBALL_MAP : BASEBALL_MAP)[status];
  return cls ?? 'UNKNOWN';
}

/**
 * 「非等待」提示狀態（結算掃描用）：這些狀態即使 startTime 被改期推到未來，
 * 也必須留在結算候選內（Codex 複審 H1：改期會把賽事推出 startTime<=now 掃描範圍，退款永遠不觸發）。
 */
export const NON_WAIT_HINT_STATUSES = ['CANC', 'ABD', 'AWD', 'WO', 'PST', 'POST', 'INTR'];

export type Outcome = 'WON' | 'LOST' | 'PUSH';

/**
 * 判定單注結果（規格 §4.1）。
 * - 勝負：足球=三選一（HOME/DRAW/AWAY，平局是 DRAW 贏）；棒球=二選一，平局 → PUSH 退本
 * - 大小分：總分 vs 盤口線；整數線剛好等於 → PUSH 退本
 */
export function decideOutcome(
  sportType: 'football' | 'baseball',
  market: 'WINLOSE' | 'OVER_UNDER',
  selection: string,
  line: number | null,
  homeScore: number,
  awayScore: number,
): Outcome {
  if (market === 'WINLOSE') {
    const result = homeScore > awayScore ? 'HOME' : awayScore > homeScore ? 'AWAY' : 'DRAW';
    if (result === 'DRAW' && sportType === 'baseball') return 'PUSH'; // 二選一遇平局退本
    return selection === result ? 'WON' : 'LOST';
  }
  // OVER_UNDER
  if (line === null) throw new Error('大小分注單缺盤口線'); // 收單已擋，防禦性
  const total = homeScore + awayScore;
  if (total === line) return 'PUSH';
  const result = total > line ? 'OVER' : 'UNDER';
  return selection === result ? 'WON' : 'LOST';
}
