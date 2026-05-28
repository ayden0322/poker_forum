'use client';

import type { NBALiveShot } from './types';

interface Props {
  shots: NBALiveShot[];
  awayTeamId?: number;
  homeTeamId?: number;
  awayColor?: string; // e.g. '#dc2626'
  homeColor?: string;
}

/**
 * NBA 半場投籃落點圖
 *
 * NBA 官方 cdn 投籃座標：x, y 範圍 0~100（半場標準化）
 *   - x: 0 = 左側底線、100 = 右側底線
 *   - y: 0 = 籃框（底線），越大越遠離籃框
 *
 * 我們把半場畫成 500x470 viewBox（保持 NBA 50x47 比例 x10），
 * 然後把 x/y 對應映射到該座標系。
 */
export function CourtChart({
  shots,
  awayTeamId,
  homeTeamId,
  awayColor = '#dc2626',
  homeColor = '#2563eb',
}: Props) {
  // 半場標準尺寸（英尺）：寬 50ft、長 47ft（中線到底線）
  // SVG viewBox：500 x 470（每 ft = 10 pixel）
  const W = 500;
  const H = 470;
  const HOOP_X = 250;
  const HOOP_Y = 52.5; // 籃框中心離底線 5.25 ft

  const shotToCoord = (s: NBALiveShot) => ({
    cx: (s.x / 100) * W,
    cy: (s.y / 100) * H,
  });

  // 最後一球（要放大 + 脈衝）
  const lastShot = shots[shots.length - 1];

  return (
    <div className="relative bg-gradient-to-b from-amber-50 to-amber-100 rounded-xl border border-amber-200 p-3 shadow-sm">
      <div className="text-xs text-gray-600 font-medium mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          投籃落點圖
        </span>
        <span className="text-[10px] text-gray-400">最近 {shots.length} 球</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        style={{ maxHeight: 360 }}
      >
        {/* 球場底色（木質） */}
        <rect x="0" y="0" width={W} height={H} fill="#f5e1b8" />

        {/* 邊線 */}
        <rect
          x="2"
          y="2"
          width={W - 4}
          height={H - 4}
          fill="none"
          stroke="#5a4a2a"
          strokeWidth="2"
        />

        {/* 罰球線禁區（油漆區）190x16ft（NBA 標準），16x19 ft 矩形 */}
        <rect
          x={HOOP_X - 80}
          y="0"
          width="160"
          height="190"
          fill="#fef3c7"
          stroke="#5a4a2a"
          strokeWidth="1.5"
        />

        {/* 罰球線圓圈 */}
        <circle
          cx={HOOP_X}
          cy="190"
          r="60"
          fill="none"
          stroke="#5a4a2a"
          strokeWidth="1.5"
        />

        {/* 三分線（左下弧 + 中央弧 + 右下弧）
            - 兩側直線部分：距底線 14ft (140px)，距邊線 3ft (30px)
            - 弧線半徑 23.75 ft = 237.5px 從籃框中心 */}
        <line
          x1="30"
          y1="0"
          x2="30"
          y2="140"
          stroke="#5a4a2a"
          strokeWidth="1.5"
        />
        <line
          x1={W - 30}
          y1="0"
          x2={W - 30}
          y2="140"
          stroke="#5a4a2a"
          strokeWidth="1.5"
        />
        <path
          d={`M 30 140 A 237.5 237.5 0 0 0 ${W - 30} 140`}
          fill="none"
          stroke="#5a4a2a"
          strokeWidth="1.5"
        />

        {/* 籃板（薄白條） */}
        <line
          x1={HOOP_X - 30}
          y1="40"
          x2={HOOP_X + 30}
          y2="40"
          stroke="#5a4a2a"
          strokeWidth="2.5"
        />

        {/* 籃框 */}
        <circle
          cx={HOOP_X}
          cy={HOOP_Y}
          r="7.5"
          fill="none"
          stroke="#c2410c"
          strokeWidth="2.5"
        />

        {/* No-charge 圓弧 */}
        <path
          d={`M ${HOOP_X - 40} ${HOOP_Y} A 40 40 0 0 0 ${HOOP_X + 40} ${HOOP_Y}`}
          fill="none"
          stroke="#5a4a2a"
          strokeWidth="1"
          strokeDasharray="3 2"
        />

        {/* 半場中線 + 半圓（半場底邊） */}
        <line
          x1="0"
          y1={H}
          x2={W}
          y2={H}
          stroke="#5a4a2a"
          strokeWidth="2"
        />

        {/* 投籃 dots */}
        {shots.map((s, idx) => {
          const { cx, cy } = shotToCoord(s);
          const isHome = s.teamId === homeTeamId;
          const teamColor = isHome ? homeColor : awayColor;
          const made = s.shotResult === 'Made';
          const isLast = s === lastShot;
          const r = isLast ? 9 : 6;

          if (made) {
            // 命中：實心 + 內部小白圓 + 邊框
            return (
              <g key={`${s.actionNumber}-${idx}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={teamColor}
                  stroke="#fff"
                  strokeWidth="1.5"
                  className={isLast ? 'nba-shot-pop' : ''}
                />
                {s.isThreePoint && (
                  <text
                    x={cx}
                    y={cy + 2}
                    textAnchor="middle"
                    fontSize="7"
                    fontWeight="bold"
                    fill="#fff"
                  >
                    3
                  </text>
                )}
                {isLast && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r + 6}
                    fill="none"
                    stroke={teamColor}
                    strokeWidth="1.5"
                    opacity="0.5"
                    className="nba-shot-ring"
                  />
                )}
              </g>
            );
          }
          // 未中：空心 + X
          return (
            <g key={`${s.actionNumber}-${idx}`} opacity={isLast ? 1 : 0.55}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="#fff"
                stroke={teamColor}
                strokeWidth="1.5"
                className={isLast ? 'nba-shot-pop' : ''}
              />
              <line
                x1={cx - 3}
                y1={cy - 3}
                x2={cx + 3}
                y2={cy + 3}
                stroke={teamColor}
                strokeWidth="1.2"
              />
              <line
                x1={cx - 3}
                y1={cy + 3}
                x2={cx + 3}
                y2={cy - 3}
                stroke={teamColor}
                strokeWidth="1.2"
              />
            </g>
          );
        })}
      </svg>

      {/* 圖例 */}
      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-gray-600">
        <span className="flex items-center gap-1">
          <span
            className="w-3 h-3 rounded-full border-2"
            style={{ backgroundColor: awayColor, borderColor: '#fff' }}
          />
          客隊
        </span>
        <span className="flex items-center gap-1">
          <span
            className="w-3 h-3 rounded-full border-2"
            style={{ backgroundColor: homeColor, borderColor: '#fff' }}
          />
          主隊
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-white border-2 border-gray-400" />
          未進
        </span>
      </div>

      <style jsx>{`
        :global(.nba-shot-pop) {
          animation: nbaShotPop 0.5s ease-out;
          transform-origin: center;
          transform-box: fill-box;
        }
        @keyframes nbaShotPop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.6); }
          100% { transform: scale(1); opacity: 1; }
        }
        :global(.nba-shot-ring) {
          animation: nbaShotRing 1.2s ease-out infinite;
          transform-origin: center;
          transform-box: fill-box;
        }
        @keyframes nbaShotRing {
          0% { transform: scale(0.6); opacity: 0.7; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
