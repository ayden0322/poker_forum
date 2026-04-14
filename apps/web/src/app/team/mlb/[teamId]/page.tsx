import TeamPageClient from './TeamPageClient';
import { apiFetch } from '@/lib/api';

interface OverviewResponse {
  data: {
    team: {
      id: number;
      name: string;
      nameZhTw?: string;
    } | null;
  };
}

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  try {
    const res = await apiFetch<OverviewResponse>(`/mlb/teams/${teamId}/overview`);
    const name = res.data.team?.nameZhTw ?? res.data.team?.name;
    return {
      title: `${name ?? 'MLB 球隊'} - 球隊資料`,
      description: `${name} 的 MLB 球隊資料、本季戰績、陣容、近期比賽`,
    };
  } catch {
    return { title: 'MLB 球隊' };
  }
}

export default async function MLBTeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  return <TeamPageClient teamId={Number(teamId)} />;
}
