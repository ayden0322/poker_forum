import { Controller, Get, Param, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MLBStatsService } from './mlb-stats.service';
import { PrismaService } from '../../common/prisma.service';
import { parseTransaction, ParsedTransaction } from './mlb-injury-dict';

/**
 * MLB 專屬 API
 * 資料來源：MLB 官方 Stats API（免費）+ Translation 表（中文化）
 */
@ApiTags('MLB')
@Controller('mlb')
export class MLBStatsController {
  constructor(
    private mlbStats: MLBStatsService,
    private prisma: PrismaService,
  ) {}

  // ============ 球員 ============

  @Get('players/:playerId')
  @ApiOperation({ summary: '取得球員個人資料（含中文翻譯）' })
  async getPlayer(@Param('playerId', ParseIntPipe) playerId: number) {
    const [player, translation] = await Promise.all([
      this.mlbStats.getPlayer(playerId),
      this.prisma.translation.findFirst({
        where: { entityType: 'player', sport: 'baseball', apiId: playerId },
      }),
    ]);

    if (!player) return { data: null };

    return {
      data: {
        ...player,
        nameZhTw: translation?.nameZhTw ?? player.fullName,
        shortName: translation?.shortName,
        nickname: translation?.nickname,
      },
    };
  }

  @Get('players/:playerId/stats')
  @ApiOperation({ summary: '取得球員賽季統計（自動判斷打擊或投手）' })
  async getPlayerStats(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Query('season', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) season: number,
  ) {
    const [player, hitting, pitching, translation] = await Promise.all([
      this.mlbStats.getPlayer(playerId),
      this.mlbStats.getPlayerSeasonHitting(playerId, season),
      this.mlbStats.getPlayerSeasonPitching(playerId, season),
      this.prisma.translation.findFirst({
        where: { entityType: 'player', sport: 'baseball', apiId: playerId },
      }),
    ]);

    return {
      data: {
        player: player
          ? { ...player, nameZhTw: translation?.nameZhTw ?? player.fullName }
          : null,
        season,
        hitting,
        pitching,
      },
    };
  }

  @Get('players/:playerId/career')
  @ApiOperation({ summary: '取得球員生涯統計' })
  async getPlayerCareer(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Query('group', new DefaultValuePipe('hitting')) group: 'hitting' | 'pitching',
  ) {
    const data = await this.mlbStats.getPlayerCareer(playerId, group);
    return { data };
  }

  // ============ 排行榜 ============

  @Get('leaders/:category')
  @ApiOperation({
    summary: '取得排行榜',
    description:
      '打擊類：homeRuns, battingAverage, runsBattedIn, hits, onBasePercentage, sluggingPercentage, stolenBases<br>投手類：earnedRunAverage, strikeouts, wins, saves, whip',
  })
  async getLeaders(
    @Param('category') category: string,
    @Query('season', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) season: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const leaders = await this.mlbStats.getLeaders(category, season, limit);
    if (!leaders || leaders.length === 0) return { data: [] };

    // 批次查翻譯
    const playerIds = leaders.map((l: any) => l.person?.id).filter(Boolean);
    const translations = await this.prisma.translation.findMany({
      where: {
        entityType: 'player',
        sport: 'baseball',
        apiId: { in: playerIds },
      },
    });
    const trMap = new Map(translations.map((t) => [t.apiId, t]));

    const data = leaders.map((l: any) => {
      const tr = trMap.get(l.person?.id);
      return {
        rank: l.rank,
        value: l.value,
        player: {
          id: l.person?.id,
          nameEn: l.person?.fullName,
          nameZhTw: tr?.nameZhTw ?? l.person?.fullName,
          shortName: tr?.shortName,
        },
        team: {
          id: l.team?.id,
          nameEn: l.team?.name,
        },
      };
    });

    return { data };
  }

  // ============ 陣容 Roster ============

  @Get('teams/:teamId/roster')
  @ApiOperation({ summary: '取得球隊陣容（MLB 官方 teamId）' })
  async getRoster(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query('season', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) season: number,
  ) {
    const roster = await this.mlbStats.getRoster(teamId, season);
    if (!roster || roster.length === 0) return { data: [] };

    const playerIds = roster.map((r: any) => r.person?.id).filter(Boolean);
    const translations = await this.prisma.translation.findMany({
      where: {
        entityType: 'player',
        sport: 'baseball',
        apiId: { in: playerIds },
      },
    });
    const trMap = new Map(translations.map((t) => [t.apiId, t]));

    const data = roster.map((r: any) => {
      const tr = trMap.get(r.person?.id);
      return {
        id: r.person?.id,
        nameEn: r.person?.fullName,
        nameZhTw: tr?.nameZhTw ?? r.person?.fullName,
        shortName: tr?.shortName,
        position: r.position?.abbreviation,
        positionName: r.position?.name,
        jerseyNumber: r.jerseyNumber,
        status: r.status?.description,
      };
    });

    return { data };
  }

  /** 用 API-Sports teamId 查 Roster（自動轉換到 MLB 官方 ID） */
  @Get('teams/:apiSportsTeamId/roster-by-apisports')
  @ApiOperation({ summary: '用 API-Sports teamId 查 Roster' })
  async getRosterByApiSports(
    @Param('apiSportsTeamId', ParseIntPipe) apiSportsTeamId: number,
    @Query('season', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) season: number,
  ) {
    const mlbTeamId = await this.mlbStats.getMlbTeamIdByApiSportsId(apiSportsTeamId);
    if (!mlbTeamId) return { data: [] };
    return this.getRoster(mlbTeamId, season);
  }

  // ============ 球隊 ============

  @Get('teams')
  @ApiOperation({ summary: '取得所有 MLB 球隊（含中文名）' })
  async getAllTeams() {
    const teams = await this.mlbStats.getAllTeams();
    if (!teams) return { data: [] };

    // 透過 extra.mlbStatsTeamId 反查翻譯
    const allTr = await this.prisma.translation.findMany({
      where: { entityType: 'team', sport: 'baseball' },
    });

    const trByMlbId = new Map<number, (typeof allTr)[number]>();
    for (const t of allTr) {
      const mlbId = (t.extra as any)?.mlbStatsTeamId;
      if (mlbId) trByMlbId.set(mlbId, t);
    }

    const data = teams.map((team: any) => {
      const tr = trByMlbId.get(team.id);
      return {
        id: team.id,
        nameEn: team.name,
        nameZhTw: tr?.nameZhTw ?? team.name,
        shortName: tr?.shortName,
        abbreviation: team.abbreviation,
        logo: `https://www.mlbstatic.com/team-logos/${team.id}.svg`,
        venue: team.venue?.name,
        division: team.division?.name,
      };
    });

    return { data };
  }

  // ============ 球隊統計 / 歷史對戰 ============

  @Get('teams/:teamId/stats')
  @ApiOperation({ summary: '球隊賽季統計（打擊 + 投手）' })
  async getTeamStats(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query('season', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) season: number,
  ) {
    const data = await this.mlbStats.getTeamStats(teamId, season);
    return { data };
  }

  @Get('teams/:teamId/recent')
  @ApiOperation({ summary: '球隊近期比賽' })
  async getTeamRecent(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query('days', new DefaultValuePipe(14), ParseIntPipe) days: number,
  ) {
    const games = await this.mlbStats.getTeamRecentGames(teamId, days);
    return { data: games };
  }

  @Get('teams/:teamId/h2h/:opponentId')
  @ApiOperation({ summary: '兩隊歷史對戰（近 N 年，預設 3 年）' })
  async getHeadToHead(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('opponentId', ParseIntPipe) opponentId: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('years', new DefaultValuePipe(3), ParseIntPipe) years: number,
  ) {
    const games = (await this.mlbStats.getHeadToHead(teamId, opponentId, { limit, years })) ?? [];

    // 統計戰績
    let teamWins = 0;
    let opponentWins = 0;
    for (const g of games) {
      const isHome = g.teams?.home?.team?.id === teamId;
      const teamScore = isHome ? g.teams?.home?.score : g.teams?.away?.score;
      const oppScore = isHome ? g.teams?.away?.score : g.teams?.home?.score;
      if (teamScore > oppScore) teamWins++;
      else if (oppScore > teamScore) opponentWins++;
    }

    return {
      data: {
        games,
        summary: {
          total: games.length,
          teamWins,
          opponentWins,
        },
      },
    };
  }

  /** 單一球隊完整詳情（一次拉所有需要的資料） */
  @Get('teams/:teamId/overview')
  @ApiOperation({ summary: '球隊完整資料（info + stats + roster + recent games）' })
  async getTeamOverview(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query('season', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) season: number,
  ) {
    const [teamInfo, stats, rosterRes, recent] = await Promise.all([
      this.mlbStats.getTeam(teamId),
      this.mlbStats.getTeamStats(teamId, season),
      this.getRoster(teamId, season),
      this.mlbStats.getTeamRecentGames(teamId, 14),
    ]);

    // 球隊中文名
    const allTr = await this.prisma.translation.findMany({
      where: { entityType: 'team', sport: 'baseball' },
    });
    const tr = allTr.find((t) => (t.extra as any)?.mlbStatsTeamId === teamId);

    return {
      data: {
        team: teamInfo
          ? {
              ...teamInfo,
              nameZhTw: tr?.nameZhTw,
              shortName: tr?.shortName,
              nickname: tr?.nickname,
            }
          : null,
        stats,
        roster: rosterRes.data,
        recentGames: recent,
      },
    };
  }

  // ============ 傷兵與交易 ============

  @Get('transactions')
  @ApiOperation({ summary: '近期交易與傷兵紀錄（預設最近 7 天）' })
  async getTransactions(
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const transactions = await this.mlbStats.getTransactions(startDate, endDate);
    return { data: transactions };
  }

  @Get('injuries')
  @ApiOperation({
    summary: 'MLB 近期傷兵動態（含球員翻譯、自動解析英文描述）',
  })
  async getInjuries(
    @Query('days', new DefaultValuePipe(14), ParseIntPipe) days: number,
    @Query('teamId', new DefaultValuePipe(0), ParseIntPipe) teamId: number,
  ) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const transactions = (await this.mlbStats.getTransactions(startDate, endDate)) ?? [];

    // 解析每筆交易
    const parsed: ParsedTransaction[] = transactions
      .map((tx: any) => parseTransaction(tx))
      .filter((p: ParsedTransaction) => p.type === 'injury' || p.type === 'activation');

    // 過濾球隊
    let filtered = parsed;
    if (teamId) {
      filtered = parsed.filter((p) => {
        const tx = transactions.find((t: any) => t.id === (p as any).id);
        return (
          tx?.fromTeam?.id === teamId ||
          tx?.toTeam?.id === teamId
        );
      });
    }

    // 球員中文名翻譯
    const playerIds = Array.from(
      new Set(filtered.map((p) => p.playerId).filter((id): id is number => !!id)),
    );
    const translations = await this.prisma.translation.findMany({
      where: {
        entityType: 'player',
        sport: 'baseball',
        apiId: { in: playerIds },
      },
    });
    const playerTrMap = new Map(translations.map((t) => [t.apiId, t]));

    // 球隊中文名翻譯
    const teamTranslations = await this.prisma.translation.findMany({
      where: { entityType: 'team', sport: 'baseball' },
    });
    const teamTrByMlbId = new Map<number, any>();
    for (const t of teamTranslations) {
      const mlbId = (t.extra as any)?.mlbStatsTeamId;
      if (mlbId) teamTrByMlbId.set(mlbId, t);
    }

    // 拼接回傳
    const data = filtered.map((p, idx) => {
      const tx = transactions[idx];
      const actualTeamId = tx?.fromTeam?.id ?? tx?.toTeam?.id;
      const playerTr = p.playerId ? playerTrMap.get(p.playerId) : null;
      const teamTr = actualTeamId ? teamTrByMlbId.get(actualTeamId) : null;

      return {
        type: p.type,
        date: p.date,
        player: p.playerId
          ? {
              id: p.playerId,
              nameEn: p.playerName,
              nameZhTw: playerTr?.nameZhTw ?? p.playerName,
              shortName: playerTr?.shortName,
            }
          : null,
        team: actualTeamId
          ? {
              id: actualTeamId,
              nameEn: tx?.fromTeam?.name ?? tx?.toTeam?.name,
              nameZhTw: teamTr?.nameZhTw,
              shortName: teamTr?.shortName,
            }
          : null,
        ilType: p.ilType,
        ilTypeZh: p.ilTypeZh,
        injury: p.injury,
        injuryZh: p.injuryZh,
        retroactive: p.retroactive,
        originalDescription: p.originalDescription,
      };
    });

    // 按日期倒序
    data.sort((a, b) => b.date.localeCompare(a.date));

    return {
      data,
      summary: {
        total: data.length,
        injuries: data.filter((d) => d.type === 'injury').length,
        activations: data.filter((d) => d.type === 'activation').length,
      },
    };
  }

  // ============ 比賽詳情 ============

  @Get('games/:gamePk/boxscore')
  @ApiOperation({ summary: '單場比賽 Box Score（含中文球員名）' })
  async getBoxScore(@Param('gamePk', ParseIntPipe) gamePk: number) {
    const data = await this.mlbStats.getBoxScore(gamePk);
    if (!data) return { data: null };

    // 收集所有球員 ID（打者+投手）
    const playerIds = new Set<number>();
    const teams = (data as any).teams ?? {};
    for (const side of ['home', 'away']) {
      const players = teams[side]?.players ?? {};
      for (const key of Object.keys(players)) {
        const id = players[key]?.person?.id;
        if (id) playerIds.add(id);
      }
    }

    // 批次查翻譯
    const translations = await this.prisma.translation.findMany({
      where: {
        entityType: 'player',
        sport: 'baseball',
        apiId: { in: Array.from(playerIds) },
      },
    });
    const trMap = new Map(translations.map((t) => [t.apiId, t]));

    // 把中文名塞進球員物件
    for (const side of ['home', 'away']) {
      const players = teams[side]?.players ?? {};
      for (const key of Object.keys(players)) {
        const p = players[key];
        const id = p.person?.id;
        if (id && trMap.has(id)) {
          const tr = trMap.get(id)!;
          p.person.nameZhTw = tr.nameZhTw;
          p.person.shortName = tr.shortName;
          p.person.nickname = tr.nickname;
        }
      }

      // 也翻譯球隊名
      const teamId = teams[side]?.team?.id;
      if (teamId) {
        const teamTr = await this.prisma.translation.findFirst({
          where: { entityType: 'team', sport: 'baseball' },
        });
        // 從 extra 找 mlbStatsTeamId
        const allTeams = await this.prisma.translation.findMany({
          where: { entityType: 'team', sport: 'baseball' },
        });
        const match = allTeams.find((t) => (t.extra as any)?.mlbStatsTeamId === teamId);
        if (match) {
          teams[side].team.nameZhTw = match.nameZhTw;
          teams[side].team.shortName = match.shortName;
        }
      }
    }

    return { data };
  }

  @Get('games/:gamePk/linescore')
  @ApiOperation({ summary: '單場比賽逐局比分' })
  async getLineScore(@Param('gamePk', ParseIntPipe) gamePk: number) {
    const data = await this.mlbStats.getLineScore(gamePk);
    return { data };
  }

  @Get('games/:gamePk/preview')
  @ApiOperation({
    summary: '賽前資訊（預計先發投手 + 先發打線，含中文翻譯）',
    description: '開賽前 1~2 天可拿到先發投手；先發打線通常開賽前 2~3 小時才公布',
  })
  async getGamePreview(@Param('gamePk', ParseIntPipe) gamePk: number) {
    const preview = await this.mlbStats.getGamePreview(gamePk);
    if (!preview) return { data: null };

    // 收集所有要翻譯的球員 ID
    const playerIds = new Set<number>();
    for (const side of ['home', 'away'] as const) {
      const pp = preview.probablePitchers[side];
      if (pp?.id) playerIds.add(pp.id);
      for (const p of preview.lineups[side]) {
        if (p?.id) playerIds.add(p.id);
      }
    }

    // 批次查球員翻譯
    const playerTranslations = playerIds.size
      ? await this.prisma.translation.findMany({
          where: {
            entityType: 'player',
            sport: 'baseball',
            apiId: { in: Array.from(playerIds) },
          },
        })
      : [];
    const playerMap = new Map(playerTranslations.map((t) => [t.apiId, t]));

    // 批次查球隊翻譯（透過 extra.mlbStatsTeamId）
    const allTeamTranslations = await this.prisma.translation.findMany({
      where: { entityType: 'team', sport: 'baseball' },
    });
    const findTeamTr = (teamId: number) =>
      allTeamTranslations.find((t) => (t.extra as any)?.mlbStatsTeamId === teamId);

    const enrichPlayer = (p: any) => {
      if (!p) return null;
      const tr = playerMap.get(p.id);
      return {
        ...p,
        nameZhTw: tr?.nameZhTw ?? p.fullName,
        shortName: tr?.shortName,
        nickname: tr?.nickname,
      };
    };

    const enrichTeam = (team: { id?: number; name?: string }) => {
      if (!team?.id) return team;
      const tr = findTeamTr(team.id);
      return {
        ...team,
        nameZhTw: tr?.nameZhTw ?? team.name,
        shortName: tr?.shortName,
      };
    };

    return {
      data: {
        gamePk: preview.gamePk,
        gameDate: preview.gameDate,
        status: preview.status,
        teams: {
          home: enrichTeam(preview.teams.home),
          away: enrichTeam(preview.teams.away),
        },
        probablePitchers: {
          home: enrichPlayer(preview.probablePitchers.home),
          away: enrichPlayer(preview.probablePitchers.away),
        },
        lineups: {
          home: preview.lineups.home.map(enrichPlayer),
          away: preview.lineups.away.map(enrichPlayer),
        },
        // 方便前端判斷：打線是否已公布
        lineupsPosted: {
          home: preview.lineups.home.length > 0,
          away: preview.lineups.away.length > 0,
        },
      },
    };
  }

  @Get('games/:gamePk')
  @ApiOperation({ summary: '比賽完整資料（整合 schedule + linescore + boxscore）' })
  async getGameSummary(@Param('gamePk', ParseIntPipe) gamePk: number) {
    const [schedule, linescore, boxscore] = await Promise.all([
      this.mlbStats.getSchedule(new Date().toISOString().slice(0, 10)),
      this.mlbStats.getLineScore(gamePk),
      this.getBoxScore(gamePk).then((r) => r.data),
    ]);

    // 從 schedule 中找到這場比賽的基本資訊（或用 gamePk 查其他日期）
    let game = schedule?.find((g: any) => g.gamePk === gamePk);

    // 如果今天的 schedule 沒有，嘗試從 boxscore 推斷
    if (!game && boxscore) {
      const bs = boxscore as any;
      game = {
        gamePk,
        teams: {
          home: { team: bs.teams?.home?.team, score: bs.teams?.home?.teamStats?.batting?.runs ?? 0 },
          away: { team: bs.teams?.away?.team, score: bs.teams?.away?.teamStats?.batting?.runs ?? 0 },
        },
        status: { detailedState: 'Final' },
      };
    }

    return {
      data: {
        game,
        linescore,
        boxscore,
      },
    };
  }

  @Get('schedule')
  @ApiOperation({ summary: 'MLB 賽程（指定美東日期）' })
  async getSchedule(@Query('date') date?: string) {
    const targetDate = date ?? new Date().toISOString().slice(0, 10);
    const games = await this.mlbStats.getSchedule(targetDate);
    return { data: games };
  }

  @Get('schedule/tw')
  @ApiOperation({
    summary: 'MLB 賽程（以台灣日期查詢，含即時比分）',
    description: '台灣一天橫跨 2 個美東日，以開打時間為準過濾',
  })
  async getScheduleByTaiwanDate(@Query('date') date?: string) {
    if (!date) {
      // 預設台灣今日
      const tw = new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
      date = new Date(tw).toISOString().slice(0, 10);
    }
    const games = await this.mlbStats.getScheduleByTaiwanDate(date);
    return { data: games };
  }
}
