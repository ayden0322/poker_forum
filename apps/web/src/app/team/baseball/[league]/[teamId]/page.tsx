import TeamPageClient from './TeamPageClient';

const LEAGUE_NAMES: Record<string, string> = {
  cpbl: '中華職棒',
  npb: '日本職棒',
  kbo: '韓國職棒',
};

export default async function BaseballTeamPage({
  params,
}: {
  params: Promise<{ league: string; teamId: string }>;
}) {
  const { league, teamId } = await params;
  return <TeamPageClient league={league} teamId={Number(teamId)} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ league: string; teamId: string }>;
}) {
  const { league, teamId } = await params;
  const leagueName = LEAGUE_NAMES[league] ?? league.toUpperCase();
  return {
    title: `${leagueName} 球隊資訊 - ${teamId}`,
    description: `${leagueName}球隊資料、近期賽事、排名`,
  };
}
