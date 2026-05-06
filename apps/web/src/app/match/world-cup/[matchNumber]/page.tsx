import WorldCupMatchPageClient from './WorldCupMatchPageClient';

export async function generateMetadata({ params }: { params: Promise<{ matchNumber: string }> }) {
  const { matchNumber } = await params;
  return {
    title: `FIFA 世界盃 2026 — 第 ${matchNumber} 場`,
    description: `FIFA 2026 世界盃比賽詳情：對戰隊伍、開賽時間、比分、場館`,
  };
}

export default async function WorldCupMatchPage({ params }: { params: Promise<{ matchNumber: string }> }) {
  const { matchNumber } = await params;
  return <WorldCupMatchPageClient matchNumber={Number(matchNumber)} />;
}
