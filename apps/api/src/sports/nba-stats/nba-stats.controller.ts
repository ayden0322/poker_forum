import { Controller, Get, Param, ParseIntPipe, Query, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NBAStatsService } from './nba-stats.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * NBA 專屬 API
 * 資料來源：ESPN（主）+ cdn.nba.com（補強）+ Translation 表（中文化）
 */
@ApiTags('NBA')
@Controller('nba')
export class NBAStatsController {
  constructor(
    private nbaStats: NBAStatsService,
    private prisma: PrismaService,
  ) {}

  // ============ 球隊 ============

  @Get('teams')
  @ApiOperation({ summary: '取得 NBA 全 30 隊（含中文翻譯）' })
  async getAllTeams() {
    const teams = await this.nbaStats.getAllTeams();
    if (!teams || teams.length === 0) return { data: [] };

    // 用球隊「英文全名」對到 Translation（基於 API-Sports 的 apiId 已 mapping）
    const translations = await this.prisma.translation.findMany({
      where: { entityType: 'team', sport: 'basketball' },
    });

    const tMap = new Map<string, any>();
    const normalize = (s: string) => s?.toLowerCase().replace(/\s+/g, '').trim();
    for (const t of translations) {
      tMap.set(normalize(t.nameEn), t);
      const extra = (t.extra as any) ?? {};
      if (extra.espnTeamId) tMap.set(`espn:${extra.espnTeamId}`, t);
    }

    const enriched = teams.map((team: any) => {
      const t = tMap.get(`espn:${team.id}`) ?? tMap.get(normalize(team.displayName));
      return {
        espnId: team.id,
        abbreviation: team.abbreviation,
        displayName: team.displayName,
        shortDisplayName: team.shortDisplayName,
        location: team.location,
        nickname: team.nickname,
        color: team.color,
        alternateColor: team.alternateColor,
        logo: team.logos?.[0]?.href,
        nameZhTw: t?.nameZhTw ?? team.displayName,
        shortName: t?.shortName,
      };
    });

    return { data: enriched };
  }

  @Get('teams/:espnTeamId')
  @ApiOperation({ summary: '取得單一球隊基本資料 + 中文名' })
  async getTeam(@Param('espnTeamId', ParseIntPipe) espnTeamId: number) {
    const [team, translation] = await Promise.all([
      this.nbaStats.getTeam(espnTeamId),
      this.prisma.translation.findFirst({
        where: { entityType: 'team', sport: 'basketball', extra: { path: ['espnTeamId'], equals: espnTeamId } },
      }),
    ]);
    if (!team) return { data: null };
    return {
      data: {
        ...team,
        nameZhTw: translation?.nameZhTw ?? team.displayName,
        shortName: translation?.shortName,
      },
    };
  }

  @Get('teams/:espnTeamId/roster')
  @ApiOperation({ summary: '取得球隊陣容（含球員中文名）' })
  async getRoster(@Param('espnTeamId', ParseIntPipe) espnTeamId: number) {
    const roster = await this.nbaStats.getRoster(espnTeamId);
    if (!roster || roster.length === 0) return { data: [] };

    const espnIds = roster.map((p: any) => Number(p.id));
    const translations = await this.prisma.translation.findMany({
      where: {
        entityType: 'player',
        sport: 'basketball',
        OR: [
          { apiId: { in: espnIds } },
          // 也支援 extra.espnPlayerId
        ],
      },
    });
    const tMap = new Map<number, any>();
    for (const t of translations) {
      tMap.set(t.apiId, t);
      const extra = (t.extra as any) ?? {};
      if (extra.espnPlayerId) tMap.set(extra.espnPlayerId, t);
    }

    const enriched = roster.map((p: any) => {
      const t = tMap.get(Number(p.id));
      return {
        espnId: Number(p.id),
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: p.fullName,
        displayName: p.displayName,
        jersey: p.jersey,
        position: p.position?.abbreviation,
        height: p.displayHeight,
        weight: p.displayWeight,
        age: p.age,
        experience: p.experience?.years,
        college: p.college?.name,
        headshot: p.headshot?.href,
        nameZhTw: t?.nameZhTw ?? p.fullName,
        nickname: t?.nickname,
      };
    });

    return { data: enriched };
  }

  @Get('teams/:espnTeamId/schedule')
  @ApiOperation({ summary: '取得球隊賽程（整季）' })
  async getTeamSchedule(@Param('espnTeamId', ParseIntPipe) espnTeamId: number) {
    const events = await this.nbaStats.getTeamSchedule(espnTeamId);
    return { data: events };
  }

  // ============ 排行榜 ============

  @Get('standings')
  @ApiOperation({ summary: 'NBA 排行榜（東西區）' })
  async getStandings() {
    const data = await this.nbaStats.getStandings();
    if (!data) return { data: { east: [], west: [] } };

    const conferences = data.children ?? [];
    const translations = await this.prisma.translation.findMany({
      where: { entityType: 'team', sport: 'basketball' },
    });
    const tByEspnId = new Map<number, any>();
    for (const t of translations) {
      const extra = (t.extra as any) ?? {};
      if (extra.espnTeamId) tByEspnId.set(extra.espnTeamId, t);
    }

    const parseConf = (conf: any) => {
      const entries = conf.standings?.entries ?? [];
      const rows = entries.map((e: any) => {
        const stats = Object.fromEntries(
          (e.stats ?? []).map((s: any) => [s.name ?? s.shortDisplayName, s]),
        );
        const team = e.team ?? {};
        const t = tByEspnId.get(Number(team.id));
        return {
          espnTeamId: Number(team.id),
          abbreviation: team.abbreviation,
          displayName: team.displayName,
          nameZhTw: t?.nameZhTw ?? team.displayName,
          shortName: t?.shortName,
          logo: team.logos?.[0]?.href,
          wins: Number(stats.wins?.value ?? 0),
          losses: Number(stats.losses?.value ?? 0),
          winPercent: stats.winPercent?.displayValue,
          winPercentValue: Number(stats.winPercent?.value ?? 0),
          gamesBehind: stats.gamesBehind?.displayValue,
          streak: stats.streak?.displayValue,
          playoffSeed: stats.playoffSeed?.displayValue,
          playoffSeedValue: Number(stats.playoffSeed?.value ?? 999),
          pointDifferential: stats.pointDifferential?.displayValue,
          home: stats.Home?.displayValue,
          road: stats.Road?.displayValue,
          lastTen: stats['Last Ten Games']?.displayValue,
          clincher: stats.clincher?.displayValue,
        };
      });
      // 優先按 playoffSeed（1-15）排序；無 seed 的放後面、再按勝率
      rows.sort((a: any, b: any) => {
        if (a.playoffSeedValue !== b.playoffSeedValue) return a.playoffSeedValue - b.playoffSeedValue;
        return b.winPercentValue - a.winPercentValue;
      });
      return rows.map((r: any, idx: number) => ({ rank: idx + 1, ...r }));
    };

    const east = conferences.find((c: any) => c.abbreviation === 'East' || c.name?.includes('Eastern'));
    const west = conferences.find((c: any) => c.abbreviation === 'West' || c.name?.includes('Western'));
    return {
      data: {
        east: east ? parseConf(east) : [],
        west: west ? parseConf(west) : [],
      },
    };
  }

  // ============ 球員 ============

  @Get('players/:playerId')
  @ApiOperation({ summary: '球員個人資料 + 中文翻譯' })
  async getPlayer(@Param('playerId', ParseIntPipe) playerId: number) {
    const [overview, translation] = await Promise.all([
      this.nbaStats.getPlayer(playerId),
      this.prisma.translation.findFirst({
        where: { entityType: 'player', sport: 'basketball', apiId: playerId },
      }),
    ]);
    if (!overview) return { data: null };
    return {
      data: {
        ...overview,
        nameZhTw: translation?.nameZhTw,
        nickname: translation?.nickname,
      },
    };
  }

  @Get('players/:playerId/stats')
  @ApiOperation({ summary: '球員生涯統計' })
  async getPlayerStats(@Param('playerId', ParseIntPipe) playerId: number) {
    const data = await this.nbaStats.getPlayerStats(playerId);
    return { data };
  }

  @Get('players/:playerId/gamelog')
  @ApiOperation({ summary: '球員逐場 gamelog' })
  async getPlayerGamelog(@Param('playerId', ParseIntPipe) playerId: number) {
    const data = await this.nbaStats.getPlayerGamelog(playerId);
    return { data };
  }

  // ============ 數據王 ============

  @Get('leaders/:category')
  @ApiOperation({ summary: 'NBA 數據王（PTS / REB / AST / STL / BLK / FG3M / FG_PCT / FT_PCT）' })
  async getLeaders(
    @Param('category') category: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const data = await this.nbaStats.getLeaders(category.toUpperCase(), '2025-26', limit);
    if (!data || data.length === 0) return { data: [] };

    // 翻譯球員名（NBA 官方 PLAYER_ID 跟 ESPN 不同，這裡先用 nameEn fuzzy match）
    const namesEn = data.map((d: any) => (d.playerName ?? '').toLowerCase());
    const translations = await this.prisma.translation.findMany({
      where: { entityType: 'player', sport: 'basketball' },
      select: { nameEn: true, nameZhTw: true, shortName: true, nickname: true, apiId: true, extra: true },
    });
    const tByName = new Map<string, any>();
    for (const t of translations) tByName.set(t.nameEn.toLowerCase(), t);

    const enriched = data.map((d: any) => {
      const t = tByName.get((d.playerName ?? '').toLowerCase());
      return {
        ...d,
        nameZhTw: t?.nameZhTw ?? d.playerName,
        nickname: t?.nickname,
        espnPlayerId: (t?.extra as any)?.espnPlayerId,
      };
    });

    return { data: enriched };
  }

  // ============ 比賽 ============

  @Get('games/:eventId/summary')
  @ApiOperation({ summary: '比賽 summary（boxscore + leaders + seasonseries + injuries）' })
  async getGameSummary(@Param('eventId') eventId: string) {
    const data = await this.nbaStats.getGameSummary(eventId);
    return { data };
  }

  @Get('games/resolve/:apiSportsGameId')
  @ApiOperation({ summary: 'API-Sports gameId → ESPN eventId 解析' })
  async resolveGameId(@Param('apiSportsGameId', ParseIntPipe) apiSportsGameId: number) {
    const eventId = await this.nbaStats.resolveApiSportsGameToEspn(apiSportsGameId);
    return { data: { espnEventId: eventId } };
  }

  @Get('games/:nbaGameId/cdn-boxscore')
  @ApiOperation({ summary: 'cdn.nba.com 即時 Box Score（NBA 官方 gameId）' })
  async getCdnBox(@Param('nbaGameId') nbaGameId: string) {
    const data = await this.nbaStats.getCdnBoxScore(nbaGameId);
    return { data };
  }

  @Get('games/:nbaGameId/cdn-pbp')
  @ApiOperation({ summary: 'cdn.nba.com Play-by-play（NBA 官方 gameId）' })
  async getCdnPbp(@Param('nbaGameId') nbaGameId: string) {
    const data = await this.nbaStats.getCdnPlayByPlay(nbaGameId);
    return { data };
  }

  @Get('scoreboard/today')
  @ApiOperation({ summary: '今日 NBA 即時計分板（cdn.nba.com）' })
  async getTodayScoreboard() {
    const data = await this.nbaStats.getTodayScoreboard();
    return { data };
  }

  // ============ 傷兵 ============

  @Get('injuries')
  @ApiOperation({ summary: '全聯盟傷兵列表（按隊伍分組，含中文翻譯）' })
  async getInjuries() {
    const groups = await this.nbaStats.getInjuries();
    if (!groups || groups.length === 0) return { data: [] };

    // 取所有 team & player ID 翻譯
    const translations = await this.prisma.translation.findMany({
      where: { sport: 'basketball' },
    });
    const teamByEspnId = new Map<number, any>();
    const playerByEspnId = new Map<number, any>();
    for (const t of translations) {
      const e = (t.extra as any) ?? {};
      if (t.entityType === 'team' && e.espnTeamId) teamByEspnId.set(e.espnTeamId, t);
      if (t.entityType === 'player') {
        if (t.apiId) playerByEspnId.set(t.apiId, t);
        if (e.espnPlayerId) playerByEspnId.set(e.espnPlayerId, t);
      }
    }

    const flat: any[] = [];
    for (const g of groups) {
      for (const inj of g.injuries ?? []) {
        const ath = inj.athlete ?? {};
        const team = ath.team ?? {};
        const teamT = team.id ? teamByEspnId.get(Number(team.id)) : null;
        const playerT = ath.id ? playerByEspnId.get(Number(ath.id)) : null;
        flat.push({
          id: inj.id,
          status: inj.status,
          type: inj.type,
          date: inj.date,
          shortComment: inj.shortComment,
          longComment: inj.longComment,
          details: inj.details,
          athlete: {
            espnId: ath.id ? Number(ath.id) : null,
            displayName: ath.displayName,
            nameZhTw: playerT?.nameZhTw,
            position: ath.position?.abbreviation,
            headshot: ath.headshot?.href,
          },
          team: {
            espnId: team.id ? Number(team.id) : null,
            abbreviation: team.abbreviation,
            displayName: team.displayName,
            nameZhTw: teamT?.nameZhTw,
            shortName: teamT?.shortName,
            logo: team.logos?.[0]?.href,
          },
        });
      }
    }
    return { data: flat };
  }
}
