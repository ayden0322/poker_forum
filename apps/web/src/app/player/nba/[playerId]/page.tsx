import NBAPlayerPageClient from './NBAPlayerPageClient';
import { apiFetch } from '@/lib/api';

interface PlayerResp {
  data: { athlete?: { displayName?: string }; nameZhTw?: string } | null;
}

export async function generateMetadata({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  try {
    const res = await apiFetch<PlayerResp>(`/nba/players/${playerId}`);
    const name = res.data?.nameZhTw ?? res.data?.athlete?.displayName;
    return {
      title: `${name ?? 'NBA 球員'} - 球員資料`,
      description: `${name} 的 NBA 球員生涯數據與基本資料`,
      alternates: { canonical: `/player/nba/${playerId}` },
    };
  } catch {
    return { title: 'NBA 球員', alternates: { canonical: `/player/nba/${playerId}` } };
  }
}

export default async function NBAPlayerPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  return <NBAPlayerPageClient playerId={Number(playerId)} />;
}
