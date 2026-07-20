// 競猜賽事 → 站內賽事資訊頁連結（使用者回饋 2026-07-08：下注前後都要能跳轉賽事頁）
// - 世界盃：/match/world-cup/{matchNumber}
//   解析策略（world_cup_matches 淘汰賽 home_team_id 為占位符 NULL，不能只靠隊名）：
//   1) 主隊英文名對上 + 開賽時間近似 → 命中
//   2) 開賽時間 ±30 分內只有唯一一場 → 命中（淘汰賽場次時段唯一）
//   行程內快取 10 分鐘。
// - MLB：站上詳情頁用 MLB gamePk（與 API-Sports game id 不同體系）→ 回 null，前端 fallback /board/mlb

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

interface WcEntry {
  matchNumber: number;
  kickoffAt: Date;
  homeEn: string | null;
}

const CACHE_MS = 10 * 60 * 1000;
/** 隊名比對時的開賽時間容差（官方賽程與 API-Sports 偶有分鐘級出入） */
const NAME_TOLERANCE_MS = 12 * 60 * 60 * 1000;
/** 純時間比對容差：同時段唯一場次才算命中 */
const TIME_TOLERANCE_MS = 30 * 60 * 1000;

@Injectable()
export class MatchLinkService {
  private readonly logger = new Logger(MatchLinkService.name);
  private entries: WcEntry[] | null = null;
  private loadedAt = 0;

  constructor(private prisma: PrismaService) {}

  /** 回站內賽事詳情頁路徑；無法對應回 null（前端 fallback 討論板） */
  async detailUrl(boardSlug: string, homeName: string, startTime: Date): Promise<string | null> {
    if (boardSlug !== 'world-cup') return null;
    try {
      const list = await this.loadWc();
      const ts = startTime.getTime();

      // 1) 隊名 + 時間近似（小組賽：同時段多場靠隊名分辨）
      const byName = list.find(
        (e) => e.homeEn === homeName && Math.abs(e.kickoffAt.getTime() - ts) < NAME_TOLERANCE_MS,
      );
      if (byName) return `/match/world-cup/${byName.matchNumber}`;

      // 2) 時間唯一（淘汰賽：home_team_id 是占位符，但同時段只有一場）
      const byTime = list.filter((e) => Math.abs(e.kickoffAt.getTime() - ts) < TIME_TOLERANCE_MS);
      if (byTime.length === 1) return `/match/world-cup/${byTime[0].matchNumber}`;

      return null;
    } catch (err) {
      this.logger.warn(`賽事連結解析失敗（${homeName}）：${err}`);
      return null;
    }
  }

  private async loadWc(): Promise<WcEntry[]> {
    if (this.entries && Date.now() - this.loadedAt < CACHE_MS) return this.entries;
    const rows = await this.prisma.$queryRaw<
      Array<{ match_number: number; kickoff_at: Date; home_en: string | null }>
    >`SELECT m.match_number, m.kickoff_at, t.name_en AS home_en
      FROM world_cup_matches m
      LEFT JOIN world_cup_teams t ON t.id = m.home_team_id`;
    this.entries = rows.map((r) => ({ matchNumber: r.match_number, kickoffAt: r.kickoff_at, homeEn: r.home_en }));
    this.loadedAt = Date.now();
    return this.entries;
  }
}
