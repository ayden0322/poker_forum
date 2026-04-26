import MatchPageClient from './MatchPageClient';

const LEAGUE_NAMES: Record<string, string> = {
  cpbl: '中華職棒',
  npb: '日本職棒',
  kbo: '韓國職棒',
};

export default async function BaseballMatchPage({
  params,
}: {
  params: Promise<{ league: string; gameId: string }>;
}) {
  const { league, gameId } = await params;
  return <MatchPageClient league={league} gameId={Number(gameId)} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ league: string; gameId: string }>;
}) {
  const { league, gameId } = await params;
  const leagueName = LEAGUE_NAMES[league] ?? league.toUpperCase();
  return {
    title: `${leagueName} 比賽詳情 - ${gameId}`,
    description: `${leagueName}單場比賽詳情、比分、逐局記錄`,
  };
}
