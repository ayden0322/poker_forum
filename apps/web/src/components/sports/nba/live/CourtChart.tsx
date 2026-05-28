'use client';

import type { NBALiveShot } from './types';

interface Props {
  shots: NBALiveShot[];
  awayTeamId?: number;
  homeTeamId?: number;
  awayColor?: string;
  homeColor?: string;
  awayName?: string;
  homeName?: string;
}

/**
 * NBA 全場視角投籃落點圖
 *
 * 佈局：左半場 = 客隊進攻方向、右半場 = 主隊進攻方向
 *
 * 座標映射：NBA cdn 給的 x/y 是「相對自己進攻籃框」的半場標準化座標：
 *   - x ∈ [0, 100]：球員視角左右
 *   - y ∈ [0, 100]：0 = 自己進攻的底線（籃框那邊）、100 = 中線
 *
 * 全場呈現：
 *   - 主隊（攻右）：全場 X 從 947.5 (右底線) 線性插值到 500 (中線)
 *   - 客隊（攻左）：全場 X 從  52.5 (左底線) 線性插值到 500 (中線)
 *   - Y 軸：兩隊都用 (x / 100) * H 對應球場寬度
 */
export function CourtChart({
  shots,
  awayTeamId,
  homeTeamId,
  awayColor = '#dc2626',
  homeColor = '#2563eb',
  awayName,
  homeName,
}: Props) {
  // 全場標準：94ft x 50ft，每 ft = ~10px → 1000x500 viewBox
  const W = 1000;
  const H = 500;
  const CENTER_X = W / 2;

  // 左右籃框中心（離底線 5.25 ft = 52.5px）
  const LEFT_HOOP_X = 52.5;
  const RIGHT_HOOP_X = W - 52.5;
  const HOOP_Y = H / 2;

  // 半場內離籃框可用範圍（從籃框到中線：500 - 52.5 = 447.5）
  const HALF_DEPTH = CENTER_X - 52.5;

  // 三分線距離籃框（半徑）23.75 ft = 237.5
  const THREE_RADIUS = 237.5;

  // 罰球禁區寬度 16ft (160), 長度 19ft (190)
  const KEY_WIDTH = 160; // 縱向（球場短軸）
  const KEY_LENGTH = 190; // 橫向（從底線往中線）

  // 投籃座標映射
  const shotToCoord = (s: NBALiveShot) => {
    const isHome = s.teamId === homeTeamId;
    if (isHome) {
      // 主隊攻右：X 從 RIGHT_HOOP_X (y=0) → CENTER_X (y=100)
      return {
        cx: RIGHT_HOOP_X - (s.y / 100) * (RIGHT_HOOP_X - CENTER_X),
        cy: (s.x / 100) * H,
      };
    }
    // 客隊攻左：X 從 LEFT_HOOP_X (y=0) → CENTER_X (y=100)
    return {
      cx: LEFT_HOOP_X + (s.y / 100) * (CENTER_X - LEFT_HOOP_X),
      cy: (s.x / 100) * H,
    };
  };

  const lastShot = shots[shots.length - 1];

  // 計算主客投籃命中率
  const stats = shots.reduce(
    (acc, s) => {
      const isHome = s.teamId === homeTeamId;
      const side = isHome ? acc.home : acc.away;
      side.total += 1;
      if (s.shotResult === 'Made') side.made += 1;
      return acc;
    },
    { home: { total: 0, made: 0 }, away: { total: 0, made: 0 } },
  );

  return (
    <div className="relative bg-gradient-to-b from-amber-50 to-amber-100 rounded-xl border border-amber-200 p-3 shadow-sm">
      <div className="text-xs text-gray-600 font-medium mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          投籃落點圖（全場）
        </span>
        <span className="text-[10px] text-gray-400">最近 {shots.length} 球</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        style={{ maxHeight: 360 }}
      >
        {/* 球場底色 */}
        <rect x="0" y="0" width={W} height={H} fill="#f5e1b8" />

        {/* 邊界 */}
        <rect
          x="2"
          y="2"
          width={W - 4}
          height={H - 4}
          fill="none"
          stroke="#5a4a2a"
          strokeWidth="2"
        />

        {/* 中線 */}
        <line
          x1={CENTER_X}
          y1="2"
          x2={CENTER_X}
          y2={H - 2}
          stroke="#5a4a2a"
          strokeWidth="1.5"
        />
        {/* 中圈 */}
        <circle
          cx={CENTER_X}
          cy={HOOP_Y}
          r="60"
          fill="none"
          stroke="#5a4a2a"
          strokeWidth="1.5"
        />
        <circle
          cx={CENTER_X}
          cy={HOOP_Y}
          r="22"
          fill="none"
          stroke="#5a4a2a"
          strokeWidth="1"
        />

        {/* 左側半場 */}
        <CourtHalf
          side="left"
          hoopX={LEFT_HOOP_X}
          hoopY={HOOP_Y}
          keyWidth={KEY_WIDTH}
          keyLength={KEY_LENGTH}
          threeRadius={THREE_RADIUS}
          H={H}
        />
        {/* 右側半場 */}
        <CourtHalf
          side="right"
          hoopX={RIGHT_HOOP_X}
          hoopY={HOOP_Y}
          keyWidth={KEY_WIDTH}
          keyLength={KEY_LENGTH}
          threeRadius={THREE_RADIUS}
          H={H}
          W={W}
        />

        {/* 進攻方向指示 */}
        <g opacity="0.45">
          <text
            x={CENTER_X - 200}
            y={32}
            textAnchor="middle"
            fontSize="14"
            fill="#5a4a2a"
            fontWeight="bold"
          >
            ← 客隊進攻
          </text>
          <text
            x={CENTER_X + 200}
            y={32}
            textAnchor="middle"
            fontSize="14"
            fill="#5a4a2a"
            fontWeight="bold"
          >
            主隊進攻 →
          </text>
        </g>

        {/* 投籃 dots */}
        {shots.map((s, idx) => {
          const { cx, cy } = shotToCoord(s);
          const isHome = s.teamId === homeTeamId;
          const teamColor = isHome ? homeColor : awayColor;
          const made = s.shotResult === 'Made';
          const isLast = s === lastShot;
          const r = isLast ? 11 : 7;

          if (made) {
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
                    y={cy + 3}
                    textAnchor="middle"
                    fontSize="9"
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
                    r={r + 8}
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
          return (
            <g key={`${s.actionNumber}-${idx}`} opacity={isLast ? 1 : 0.5}>
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
                x1={cx - 3.5}
                y1={cy - 3.5}
                x2={cx + 3.5}
                y2={cy + 3.5}
                stroke={teamColor}
                strokeWidth="1.4"
              />
              <line
                x1={cx - 3.5}
                y1={cy + 3.5}
                x2={cx + 3.5}
                y2={cy - 3.5}
                stroke={teamColor}
                strokeWidth="1.4"
              />
            </g>
          );
        })}
      </svg>

      {/* 圖例 + 命中率 */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div className="flex items-center gap-2 px-2 py-1 bg-white/60 rounded">
          <span
            className="w-3 h-3 rounded-full border-2"
            style={{ backgroundColor: awayColor, borderColor: '#fff' }}
          />
          <span className="text-gray-600">客隊</span>
          {awayName && <span className="font-bold text-gray-800">{awayName}</span>}
          {stats.away.total > 0 && (
            <span className="ml-auto tabular-nums text-gray-500">
              {stats.away.made}/{stats.away.total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 px-2 py-1 bg-white/60 rounded">
          {homeName && <span className="font-bold text-gray-800">{homeName}</span>}
          <span className="text-gray-600">主隊</span>
          <span
            className="w-3 h-3 rounded-full border-2 ml-auto"
            style={{ backgroundColor: homeColor, borderColor: '#fff' }}
          />
          {stats.home.total > 0 && (
            <span className="tabular-nums text-gray-500">
              {stats.home.made}/{stats.home.total}
            </span>
          )}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-center gap-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-gray-400 border-2 border-white" />
          命中
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-white border-2 border-gray-400" />
          未進
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-gray-600 bg-gray-200 rounded px-1">
            3
          </span>
          三分球
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

/**
 * 半場線條（罰球線禁區、罰球圓圈、三分線、籃板、籃框、no-charge 弧）
 *
 * 全場視角下，左半場與右半場是鏡像關係，所以這個子元件接 side 參數
 * 控制畫向。籃框中心點透過 hoopX/hoopY 傳入。
 */
function CourtHalf({
  side,
  hoopX,
  hoopY,
  keyWidth,
  keyLength,
  threeRadius,
  H,
  W,
}: {
  side: 'left' | 'right';
  hoopX: number;
  hoopY: number;
  keyWidth: number;
  keyLength: number;
  threeRadius: number;
  H: number;
  W?: number;
}) {
  // 從底線開始往中線方向的方向係數（左半場朝右、右半場朝左）
  const dir = side === 'left' ? 1 : -1;
  const baseLineX = side === 'left' ? 0 : (W ?? 0);
  const ftFromBaseLine = (ft: number) => baseLineX + dir * ft;

  // 罰球禁區：靠底線那一側，長 keyLength，寬 keyWidth（縱向居中）
  const keyOuterX1 = side === 'left' ? 0 : (W ?? 0) - keyLength;
  const keyTop = hoopY - keyWidth / 2;

  // 罰球線位置（離底線 keyLength）
  const ftLineX = ftFromBaseLine(keyLength);

  // 三分直線部分：底線往中線方向延伸 14ft (140)，距邊線 3ft (30)
  const threeStraightLength = 140;
  const threeStraightEndX = ftFromBaseLine(threeStraightLength);

  return (
    <g>
      {/* 罰球禁區 */}
      <rect
        x={keyOuterX1}
        y={keyTop}
        width={keyLength}
        height={keyWidth}
        fill="#fef3c7"
        stroke="#5a4a2a"
        strokeWidth="1.5"
      />
      {/* 罰球圓圈（在罰球線中心） */}
      <circle
        cx={ftLineX}
        cy={hoopY}
        r="60"
        fill="none"
        stroke="#5a4a2a"
        strokeWidth="1.5"
        strokeDasharray={side === 'left' ? '0' : '0'}
      />

      {/* 三分線兩條直線 */}
      <line
        x1={baseLineX}
        y1={hoopY - keyWidth / 2 - 25}
        x2={threeStraightEndX}
        y2={hoopY - keyWidth / 2 - 25}
        stroke="#5a4a2a"
        strokeWidth="1.5"
      />
      <line
        x1={baseLineX}
        y1={hoopY + keyWidth / 2 + 25}
        x2={threeStraightEndX}
        y2={hoopY + keyWidth / 2 + 25}
        stroke="#5a4a2a"
        strokeWidth="1.5"
      />
      {/* 三分弧 */}
      <path
        d={
          side === 'left'
            ? `M ${threeStraightEndX} ${hoopY - keyWidth / 2 - 25} A ${threeRadius} ${threeRadius} 0 0 1 ${threeStraightEndX} ${hoopY + keyWidth / 2 + 25}`
            : `M ${threeStraightEndX} ${hoopY - keyWidth / 2 - 25} A ${threeRadius} ${threeRadius} 0 0 0 ${threeStraightEndX} ${hoopY + keyWidth / 2 + 25}`
        }
        fill="none"
        stroke="#5a4a2a"
        strokeWidth="1.5"
      />

      {/* 籃板 */}
      <line
        x1={ftFromBaseLine(40)}
        y1={hoopY - 30}
        x2={ftFromBaseLine(40)}
        y2={hoopY + 30}
        stroke="#5a4a2a"
        strokeWidth="2.5"
      />

      {/* 籃框 */}
      <circle
        cx={hoopX}
        cy={hoopY}
        r="7.5"
        fill="none"
        stroke="#c2410c"
        strokeWidth="2.5"
      />

      {/* No-charge 圓弧 */}
      <path
        d={
          side === 'left'
            ? `M ${hoopX} ${hoopY - 40} A 40 40 0 0 1 ${hoopX} ${hoopY + 40}`
            : `M ${hoopX} ${hoopY - 40} A 40 40 0 0 0 ${hoopX} ${hoopY + 40}`
        }
        fill="none"
        stroke="#5a4a2a"
        strokeWidth="1"
        strokeDasharray="3 2"
      />
    </g>
  );
}
