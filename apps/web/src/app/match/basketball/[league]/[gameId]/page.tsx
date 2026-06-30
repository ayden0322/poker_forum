import { apiFetch } from '@/lib/api';
import { notFound } from 'next/navigation';
import BasketballMatchClient, { BBGame, BBTeam } from './BasketballMatchClient';

interface LeagueConfig {
  displayName: string;
  capabilities: { boxScore: boolean; odds: boolean } | null;
}

function teamLabel(t: BBTeam): string {
  return t.nameZhTw ?? t.name;
}

async function fetchGame(league: string, gameId: number): Promise<BBGame | null> {
  try {
    const res = await apiFetch<{ data: BBGame | null }>(`/basketball/${league}/games/${gameId}`);
    return res.data ?? null;
  } catch {
    return null;
  }
}

async function fetchConfig(league: string): Promise<LeagueConfig | null> {
  try {
    const res = await apiFetch<{ data: LeagueConfig }>(`/basketball/${league}/config`);
    return res.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ league: string; gameId: string }>;
}) {
  const { league, gameId } = await params;
  const [game, cfg] = await Promise.all([fetchGame(league, Number(gameId)), fetchConfig(league)]);
  const leagueName = cfg?.displayName ?? league.toUpperCase();
  if (!game) {
    return { title: `${leagueName} 比賽詳情`, description: `${leagueName}單場比賽詳情、比分與數據`, alternates: { canonical: `/match/basketball/${league}/${gameId}` } };
  }
  const h = teamLabel(game.teams.home);
  const a = teamLabel(game.teams.away);
  const scoreLine =
    game.teams.home.score != null && game.teams.away.score != null
      ? ` ${game.teams.home.score}-${game.teams.away.score}`
      : '';
  return {
    title: `${h} vs ${a}${scoreLine} - ${leagueName}比賽詳情`,
    description: `${leagueName} ${h} 對 ${a} 單場比賽${scoreLine ? '比分' : '預告'}、逐節得分、Box Score 與球隊數據。`,
    alternates: { canonical: `/match/basketball/${league}/${gameId}` },
  };
}

export default async function BasketballMatchPage({
  params,
}: {
  params: Promise<{ league: string; gameId: string }>;
}) {
  const { league, gameId } = await params;
  const [game, cfg] = await Promise.all([fetchGame(league, Number(gameId)), fetchConfig(league)]);
  if (!game) notFound();

  const leagueName = cfg?.displayName ?? league.toUpperCase();
  const h = teamLabel(game.teams.home);
  const a = teamLabel(game.teams.away);

  // SportsEvent 結構化資料（讓 SERP 能拿到帶比分/時間的 rich result）
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${h} vs ${a}`,
    sport: 'Basketball',
    startDate: game.timestamp ? new Date(game.timestamp * 1000).toISOString() : undefined,
    eventStatus:
      game.statusShort === 'FT'
        ? 'https://schema.org/EventScheduled'
        : game.statusShort === 'LIVE'
        ? 'https://schema.org/EventScheduled'
        : 'https://schema.org/EventScheduled',
    location: game.venue ? { '@type': 'Place', name: game.venue } : undefined,
    competitor: [
      { '@type': 'SportsTeam', name: h, image: game.teams.home.logo || undefined },
      { '@type': 'SportsTeam', name: a, image: game.teams.away.logo || undefined },
    ],
    superEvent: { '@type': 'SportsOrganization', name: leagueName },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BasketballMatchClient
        league={league}
        leagueName={leagueName}
        game={game}
        canBoxScore={!!cfg?.capabilities?.boxScore}
        canOdds={!!cfg?.capabilities?.odds}
      />
    </>
  );
}
