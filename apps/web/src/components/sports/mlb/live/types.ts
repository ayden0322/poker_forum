/**
 * MLB 動畫直播：前端共用型別
 * 對應後端 `/mlb/games/:gamePk/live` 回傳的精簡 payload
 */

export interface LivePerson {
  id: number;
  fullName: string;
  nameZhTw: string;
  shortName: string | null;
}

export interface LiveTeam {
  id: number;
  name: string;
  abbreviation?: string;
  nameZhTw: string;
  shortName: string;
}

export interface LiveLinescore {
  currentInning?: number;
  currentInningOrdinal?: string;
  inningState?: string;
  inningHalf?: string;
  isTopInning?: boolean;
  balls: number;
  strikes: number;
  outs: number;
  awayRuns: number;
  homeRuns: number;
  awayHits: number;
  homeHits: number;
  awayErrors: number;
  homeErrors: number;
  onFirst: LivePerson | null;
  onSecond: LivePerson | null;
  onThird: LivePerson | null;
  offenseTeamId?: number;
  defenseTeamId?: number;
}

export interface LiveHotZone {
  zone: string;
  color: string;
  temp: 'hot' | 'warm' | 'lukewarm' | 'cool' | 'cold';
  value: string;
}

export interface LiveMatchup {
  atBatIndex?: number;
  isComplete: boolean;
  batter: LivePerson | null;
  batSide?: 'L' | 'R' | 'S';
  pitcher: LivePerson | null;
  pitchHand?: 'L' | 'R';
  menOnBase?: string; // 'Empty' / 'RISP' / 'Loaded' / 'Men_On'
  batterHotColdZones: LiveHotZone[];
  count: { balls: number; strikes: number; outs: number };
  onDeck: LivePerson | null;
}

export interface LiveLastPitch {
  atBatIndex?: number;
  playId?: string;
  pitchNumber?: number;
  startTime?: string;
  call?: string;
  callCode?: string;
  description?: string;
  isStrike: boolean;
  isBall: boolean;
  isInPlay: boolean;
  ballColor?: string;
  pitchType?: string;
  pitchTypeCode?: string;
  startSpeed?: number;
  endSpeed?: number;
  spinRate?: number;
  zone?: number;
  pX?: number;
  pZ?: number;
  strikeZoneTop?: number;
  strikeZoneBottom?: number;
  hit: {
    launchSpeed?: number;
    launchAngle?: number;
    totalDistance?: number;
    trajectory?: string;
    hardness?: string;
    location?: string;
  } | null;
}

export interface LiveRecentPlay {
  atBatIndex?: number;
  inning?: number;
  halfInning?: 'top' | 'bottom';
  isScoringPlay: boolean;
  hasOut: boolean;
  batter: LivePerson | null;
  pitcher: LivePerson | null;
  event?: string;
  eventType?: string;
  description?: string;
  rbi: number;
  awayScore: number;
  homeScore: number;
  endTime?: string;
}

export interface LiveSnapshot {
  gamePk: number;
  status: {
    abstractGameState?: string; // 'Preview' / 'Live' / 'Final'
    detailedState?: string;
    codedGameState?: string;
  } | null;
  teams: { away: LiveTeam | null; home: LiveTeam | null };
  linescore: LiveLinescore;
  matchup: LiveMatchup | null;
  lastPitch: LiveLastPitch | null;
  recentPlays: LiveRecentPlay[];
  scoringPlayIndexes: number[];
}

export interface LiveResponse {
  data: LiveSnapshot | null;
}
