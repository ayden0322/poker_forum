'use client';

import Link from 'next/link';
import type { LivePerson, LiveMatchup } from './types';

interface Props {
  matchup: LiveMatchup;
}

const HEADSHOT = (id: number) =>
  `https://midfield.mlbstatic.com/v1/people/${id}/spots/120`;

function personDisplayName(p: LivePerson) {
  return p.shortName ?? p.nameZhTw ?? p.fullName;
}

/**
 * 投打對決卡
 *
 * 左：投手照 + 名字 + 投球臂（L/R）
 * 中：VS + 得點圈狀態（RISP / Loaded / Empty）
 * 右：打者照 + 名字 + 打擊側（L/R/S） + 下一棒
 */
export function MatchupCard({ matchup }: Props) {
  const { batter, pitcher, batSide, pitchHand, menOnBase, onDeck } = matchup;

  // 得點圈狀態中文化
  const menOnBaseText = (() => {
    switch (menOnBase) {
      case 'Loaded':
        return '滿壘';
      case 'RISP':
        return '得點圈有人';
      case 'Men_On':
        return '壘上有人';
      case 'Empty':
        return '壘上無人';
      default:
        return '';
    }
  })();

  const menOnBaseClass = (() => {
    switch (menOnBase) {
      case 'Loaded':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'RISP':
        return 'bg-amber-100 text-amber-700 border-amber-300';
      case 'Men_On':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-300';
    }
  })();

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="text-xs text-gray-500 font-medium mb-2 text-center">本打席對決</div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* 投手 */}
        {pitcher ? (
          <Link
            href={`/player/mlb/${pitcher.id}`}
            className="flex flex-col items-center group"
          >
            <div className="relative">
              <img
                src={HEADSHOT(pitcher.id)}
                alt={personDisplayName(pitcher)}
                className="w-16 h-16 rounded-full object-cover border-2 border-green-500 bg-gray-100"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = '0.3';
                }}
              />
              {pitchHand && (
                <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                  {pitchHand}
                </span>
              )}
            </div>
            <div className="text-[10px] text-gray-500 mt-1.5 uppercase tracking-wide">
              投手
            </div>
            <div className="text-sm font-bold text-gray-800 group-hover:text-blue-600 group-hover:underline text-center leading-tight">
              {personDisplayName(pitcher)}
            </div>
          </Link>
        ) : (
          <div className="text-center text-xs text-gray-400">投手未定</div>
        )}

        {/* 中間 VS + 狀態 */}
        <div className="flex flex-col items-center gap-1.5 px-2">
          <span className="text-xl font-black text-gray-300">VS</span>
          {menOnBaseText && (
            <span
              className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${menOnBaseClass}`}
            >
              {menOnBaseText}
            </span>
          )}
        </div>

        {/* 打者 */}
        {batter ? (
          <Link
            href={`/player/mlb/${batter.id}`}
            className="flex flex-col items-center group"
          >
            <div className="relative">
              <img
                src={HEADSHOT(batter.id)}
                alt={personDisplayName(batter)}
                className="w-16 h-16 rounded-full object-cover border-2 border-blue-500 bg-gray-100"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = '0.3';
                }}
              />
              {batSide && (
                <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                  {batSide}
                </span>
              )}
            </div>
            <div className="text-[10px] text-gray-500 mt-1.5 uppercase tracking-wide">
              打者
            </div>
            <div className="text-sm font-bold text-gray-800 group-hover:text-blue-600 group-hover:underline text-center leading-tight">
              {personDisplayName(batter)}
            </div>
          </Link>
        ) : (
          <div className="text-center text-xs text-gray-400">打者未定</div>
        )}
      </div>

      {/* 下一棒 */}
      {onDeck && (
        <div className="mt-3 pt-2 border-t border-gray-100 text-center text-xs text-gray-500">
          下一棒：
          <Link
            href={`/player/mlb/${onDeck.id}`}
            className="text-blue-600 hover:underline font-medium ml-1"
          >
            {personDisplayName(onDeck)}
          </Link>
        </div>
      )}
    </div>
  );
}
