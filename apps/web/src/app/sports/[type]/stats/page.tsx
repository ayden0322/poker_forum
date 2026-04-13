import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SportsStatsClient from './SportsStatsClient';

const SPORT_META: Record<string, { name: string; icon: string; boardSlug: string }> = {
  baseball: { name: '棒球', icon: '⚾', boardSlug: 'baseball' },
  basketball: { name: '籃球', icon: '🏀', boardSlug: 'basketball' },
  soccer: { name: '足球', icon: '⚽', boardSlug: 'soccer' },
};

export async function generateMetadata({ params }: { params: { type: string } }): Promise<Metadata> {
  const meta = SPORT_META[params.type];
  if (!meta) return { title: '頁面不存在 - 博客邦' };

  return {
    title: `${meta.name}數據中心 - 博客邦`,
    description: `${meta.name}賽事排名、球員數據與賠率資訊`,
  };
}

export default function SportsStatsPage({ params }: { params: { type: string } }) {
  const meta = SPORT_META[params.type];
  if (!meta) notFound();

  return <SportsStatsClient sportType={params.type} sportName={meta.name} sportIcon={meta.icon} boardSlug={meta.boardSlug} />;
}
