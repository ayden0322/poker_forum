'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import CpblBoxScore from '@/components/sports/CpblBoxScore';

interface BoxScoreResponse {
  success: boolean;
  data: {
    gameSno: number;
    year: number;
    gameDetail: {
      visitingTeam: string;
      homeTeam: string;
      visitingTeamLogo: string | null;
      homeTeamLogo: string | null;
      visitingScore: number;
      homeScore: number;
      gameStatus: number | null;
      gameStatusText: string | null;
      visitingRecord: string | null;
      homeRecord: string | null;
    } | null;
  } | null;
}

export default function CpblBoxPageClient({ gameSno }: { gameSno: number }) {
  // 先抓基本資料用於 header
  const { data: boxData } = useQuery({
    queryKey: ['cpbl-boxscore-header', gameSno],
    queryFn: () => apiFetch<BoxScoreResponse>(`/cpbl/games/${gameSno}/boxscore`),
    staleTime: 60 * 1000,
  });

  const detail = boxData?.data?.gameDetail;
  const isFinished = detail?.gameStatus === 3;
  const isLive = detail?.gameStatus != null && detail.gameStatus !== 3 && detail.gameStatus > 0;

  return (
    <div className="max-w-5xl mx-auto">
      {/* 麵包屑 */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <Link href="/board/cpbl" className="hover:text-blue-600">中華職棒</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Box Score</span>
      </nav>

      {/* 比分頭卡 */}
      <div className="bg-gradient-to-r from-red-700 to-red-900 text-white rounded-2xl p-6 mb-6 shadow-lg">
        {/* LIVE 指示 */}
        {isLive && (
          <div className="text-center mb-3">
            <span className="inline-flex items-center gap-1.5 bg-red-500/80 text-white text-xs font-bold px-3 py-1 rounded-full">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              比賽進行中
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          {/* 客隊 */}
          <div className="flex-1 text-center">
            {detail?.visitingTeamLogo && (
              <img
                src={detail.visitingTeamLogo}
                alt={detail.visitingTeam}
                className="w-16 h-16 mx-auto mb-2 object-contain bg-white/10 rounded-xl p-1"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            )}
            <div className="text-xs opacity-70">客隊</div>
            <div className="font-bold text-lg">{detail?.visitingTeam ?? '客隊'}</div>
            {detail?.visitingRecord && (
              <div className="text-xs opacity-60 mt-0.5">{detail.visitingRecord}</div>
            )}
            <div className={`text-5xl font-black tabular-nums mt-2 ${
              detail && detail.visitingScore > detail.homeScore ? '' : 'opacity-50'
            }`}>
              {detail?.visitingScore ?? '-'}
            </div>
          </div>

          {/* 中間 */}
          <div className="text-center px-4">
            <div className="text-xs opacity-70 mb-1">
              {isFinished ? '已結束' : isLive ? '進行中' : ''}
            </div>
            <div className="text-2xl opacity-50 my-2">VS</div>
            <div className="text-xs opacity-70">CPBL 官方戰報</div>
          </div>

          {/* 主隊 */}
          <div className="flex-1 text-center">
            {detail?.homeTeamLogo && (
              <img
                src={detail.homeTeamLogo}
                alt={detail.homeTeam}
                className="w-16 h-16 mx-auto mb-2 object-contain bg-white/10 rounded-xl p-1"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            )}
            <div className="text-xs opacity-70">主隊</div>
            <div className="font-bold text-lg">{detail?.homeTeam ?? '主隊'}</div>
            {detail?.homeRecord && (
              <div className="text-xs opacity-60 mt-0.5">{detail.homeRecord}</div>
            )}
            <div className={`text-5xl font-black tabular-nums mt-2 ${
              detail && detail.homeScore > detail.visitingScore ? '' : 'opacity-50'
            }`}>
              {detail?.homeScore ?? '-'}
            </div>
          </div>
        </div>
      </div>

      {/* Box Score 元件 */}
      <CpblBoxScore gameSno={gameSno} />

      <div className="text-xs text-gray-400 text-center mt-6 pb-4">
        資料來源：CPBL 中華職棒大聯盟官方網站
      </div>
    </div>
  );
}
