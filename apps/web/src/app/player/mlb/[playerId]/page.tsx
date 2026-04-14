import { apiFetch } from '@/lib/api';
import { notFound } from 'next/navigation';
import PlayerPageClient from './PlayerPageClient';

interface PlayerData {
  id: number;
  fullName: string;
  nameZhTw: string;
  shortName?: string;
  nickname?: string;
  firstName: string;
  lastName: string;
  primaryNumber?: string;
  birthDate?: string;
  birthCountry?: string;
  height?: string;
  weight?: number;
  primaryPosition?: { name: string; abbreviation: string };
  batSide?: { description: string };
  pitchHand?: { description: string };
  mlbDebutDate?: string;
  active: boolean;
  currentTeam?: { id: number; name: string };
  draftYear?: number;
}

interface Response {
  data: PlayerData | null;
}

export async function generateMetadata({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  try {
    const res = await apiFetch<Response>(`/mlb/players/${playerId}`);
    if (!res.data) return { title: '找不到球員' };
    return {
      title: `${res.data.nameZhTw} - MLB 球員資料`,
      description: `${res.data.nameZhTw}（${res.data.fullName}）的 MLB 個人資料、本季成績、生涯數據`,
    };
  } catch {
    return { title: 'MLB 球員' };
  }
}

export default async function MLBPlayerPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  let playerData: PlayerData | null = null;

  try {
    const res = await apiFetch<Response>(`/mlb/players/${playerId}`);
    playerData = res.data;
  } catch {
    // API 未啟動
  }

  if (!playerData) return notFound();

  return <PlayerPageClient player={playerData} />;
}
