/**
 * NBA 動畫直播：前端共用型別
 * 對應後端 `/nba/games/:eventId/live` 回傳的精簡 payload
 */

export interface NBALiveStatus {
  gameStatus: number; // 1=排定 / 2=進行中 / 3=結束
  statusText: string;
  period: number;
  clock: string; // ISO 8601 duration: "PT12M34.56S"
  gameTimeUTC?: string;
  attendance?: number;
  sellout?: boolean;
}

export interface NBALivePeriodScore {
  period: number;
  score: number;
}

export interface NBALiveTeam {
  teamId: number;
  teamName: string;
  teamCity: string;
  teamTricode: string;
  score: number;
  timeoutsRemaining: number;
  inBonus: boolean;
  periods: NBALivePeriodScore[];
  nameZhTw: string;
  shortName: string;
}

export interface NBALivePlayer {
  personId: number;
  name: string;
  nameI?: string;
  firstName?: string;
  familyName?: string;
  jerseyNum?: string;
  position?: string;
  starter: boolean;
  oncourt: boolean;
  status: string; // "ACTIVE" / "INACTIVE"
  stats: {
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    turnovers: number;
    plusMinus: number;
    fgm: number;
    fga: number;
    tpm: number;
    tpa: number;
    ftm: number;
    fta: number;
    minutes: string;
    fouls: number;
  };
  nameZhTw: string;
  shortName: string;
}

export interface NBALiveAction {
  actionNumber: number;
  period: number;
  clock: string;
  teamId?: number;
  teamTricode?: string;
  actionType: string;
  subType?: string;
  descriptor?: string;
  qualifiers?: string[];
  personId?: number;
  playerName?: string;
  playerNameI?: string;
  playerNameZhTw?: string | null;
  playerShortName?: string | null;
  description: string;
  scoreAway: string;
  scoreHome: string;
  shotResult?: string; // "Made" / "Missed"
  pointsTotal?: number;
  isFieldGoal?: number;
  shotDistance?: number;
  area?: string;
}

export interface NBALiveShot {
  actionNumber: number;
  period: number;
  clock: string;
  teamId?: number;
  teamTricode?: string;
  personId?: number;
  playerName?: string;
  playerNameI?: string;
  playerNameZhTw?: string | null;
  playerShortName?: string | null;
  x: number; // 0~100，半場標準化座標（0=左 100=右）
  y: number; // 0~100，0=籃框、越大越遠
  shotDistance?: number;
  shotResult: string; // "Made" / "Missed"
  pointsTotal?: number;
  isThreePoint: boolean;
  area?: string;
  subType?: string;
}

export interface NBALiveMomentum {
  period: number;
  clock: string;
  diff: number; // home - away
}

export interface NBALiveSnapshot {
  nbaGameId: string;
  status: NBALiveStatus;
  teams: { away: NBALiveTeam | null; home: NBALiveTeam | null };
  players: { away: NBALivePlayer[]; home: NBALivePlayer[] };
  recentActions: NBALiveAction[];
  recentShots: NBALiveShot[];
  momentum: NBALiveMomentum[];
  totalActions: number;
}

export interface NBALiveResponse {
  data: NBALiveSnapshot | null;
}

/** 解析 ISO 8601 duration "PT12M34.56S" → "12:34" */
export function formatClock(iso: string | undefined | null): string {
  if (!iso) return '--:--';
  const m = iso.match(/PT(\d+)M([\d.]+)S/);
  if (!m) return iso;
  const minutes = parseInt(m[1], 10);
  const seconds = parseFloat(m[2]);
  return `${minutes}:${seconds.toFixed(0).padStart(2, '0')}`;
}

/** 節數中文化（含 OT） */
export function periodLabel(period: number | undefined): string {
  if (!period) return '-';
  if (period <= 4) return `第 ${period} 節`;
  return `OT${period - 4}`;
}
