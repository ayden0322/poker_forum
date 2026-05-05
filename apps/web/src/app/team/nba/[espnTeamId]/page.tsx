import NBATeamPageClient from './NBATeamPageClient';
import { apiFetch } from '@/lib/api';

interface TeamResponse {
  data: { displayName?: string; nameZhTw?: string } | null;
}

export async function generateMetadata({ params }: { params: Promise<{ espnTeamId: string }> }) {
  const { espnTeamId } = await params;
  try {
    const res = await apiFetch<TeamResponse>(`/nba/teams/${espnTeamId}`);
    const name = res.data?.nameZhTw ?? res.data?.displayName;
    return {
      title: `${name ?? 'NBA 球隊'} - 球隊資料`,
      description: `${name} 的 NBA 球隊資料、本季戰績、陣容、賽程`,
    };
  } catch {
    return { title: 'NBA 球隊' };
  }
}

export default async function NBATeamPage({ params }: { params: Promise<{ espnTeamId: string }> }) {
  const { espnTeamId } = await params;
  return <NBATeamPageClient espnTeamId={Number(espnTeamId)} />;
}
