import MatchPageClient from './MatchPageClient';

export default async function MLBMatchPage({ params }: { params: Promise<{ gamePk: string }> }) {
  const { gamePk } = await params;
  return <MatchPageClient gamePk={Number(gamePk)} />;
}

export async function generateMetadata({ params }: { params: Promise<{ gamePk: string }> }) {
  const { gamePk } = await params;
  return {
    title: `MLB 比賽詳情 - ${gamePk}`,
    description: 'MLB 單場比賽詳細戰報、逐局比分、球員成績',
  };
}
