import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import FriendlyMatchPageClient from './FriendlyMatchPageClient';

interface MatchMeta {
  id: number;
  home: { nameZh: string; nameEn: string };
  away: { nameZh: string; nameEn: string };
  isFeatured: boolean;
  kickoffAt: string;
}

/**
 * SEO 策略：以資訊完整為主，全部友誼賽場次皆允許被索引（不再只開焦點戰白名單）。
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const { data } = await apiFetch<{ data: MatchMeta }>(`/sports/friendlies/match/${id}`);
    const title = `${data.home.nameZh} vs ${data.away.nameZh}｜國際足球友誼賽 2026`;
    const description = `${data.home.nameZh}對${data.away.nameZh}國際友誼賽：開賽時間、即時比分、賽事資訊。`;
    return {
      title,
      description,
    };
  } catch {
    return { title: '國際足球友誼賽 2026', robots: { index: false, follow: true } };
  }
}

export default async function FriendlyMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FriendlyMatchPageClient matchId={Number(id)} />;
}
