'use client';

import type { LiveLastPitch } from './types';

interface Props {
  lastPitch: LiveLastPitch;
}

/**
 * 最後一球資訊面板
 *
 * - 左：球速大字 + 球種 + 轉速
 * - 中：9 宮格好球帶示意 + 進壘點圓點（用 MLB 給的 ballColor 上色）
 * - 右：結果 call + 擊出去的話顯示 launchSpeed / 軌跡
 */
export function LastPitch({ lastPitch }: Props) {
  const {
    pitchType,
    pitchTypeCode,
    startSpeed,
    spinRate,
    call,
    description,
    isStrike,
    isBall,
    isInPlay,
    ballColor,
    pX,
    pZ,
    strikeZoneTop,
    strikeZoneBottom,
    hit,
  } = lastPitch;

  // 進壘點：MLB 的 pX 範圍 ≈ ±0.83 ft（好球帶寬），pZ 在 strikeZoneBottom~Top（≈1.5~3.5）
  // 把它投影到 100x140 viewBox 上的 9 宮格區域（好球帶為中間 60x60，外圈為球擴展區）
  const ZONE_VIEW = { w: 100, h: 140, zoneW: 60, zoneH: 70, cx: 50, cy: 70 };
  const zoneCoord = (() => {
    if (pX === undefined || pZ === undefined) return null;
    // pX: 負 = 左打者外側／右打者內側；正反之。鏡像後 viewer 視角 = 投手視角
    const halfW = 0.83;
    const top = strikeZoneTop ?? 3.5;
    const bottom = strikeZoneBottom ?? 1.5;
    const midZ = (top + bottom) / 2;
    const halfH = (top - bottom) / 2 || 1;
    // 轉成 -1 ~ 1（球到外圍會超出）
    const nx = pX / halfW;
    const nz = (pZ - midZ) / halfH;
    // 投影到 viewBox（pZ 正向是高，SVG y 正向是下，所以要反轉）
    const x = ZONE_VIEW.cx + nx * (ZONE_VIEW.zoneW / 2);
    const y = ZONE_VIEW.cy - nz * (ZONE_VIEW.zoneH / 2);
    return { x, y };
  })();

  // 結果顏色
  const resultColor = isInPlay
    ? 'bg-blue-100 text-blue-700 border-blue-300'
    : isStrike
    ? 'bg-amber-100 text-amber-700 border-amber-300'
    : isBall
    ? 'bg-green-100 text-green-700 border-green-300'
    : 'bg-gray-100 text-gray-700 border-gray-300';

  const resultText = (() => {
    if (!call) return '-';
    // 常見 call code 翻譯
    const map: Record<string, string> = {
      'Called Strike': '看見好球',
      'Swinging Strike': '揮棒落空',
      'Swinging Strike (Blocked)': '揮棒落空（擋接）',
      'Foul': '界外',
      'Foul Tip': '擦棒被捕',
      'Ball': '壞球',
      'Ball In Dirt': '觸地壞球',
      'In play, out(s)': '擊出 - 出局',
      'In play, no out': '擊出 - 上壘',
      'In play, run(s)': '擊出 - 得分',
      'Hit By Pitch': '觸身球',
    };
    return map[call] ?? call;
  })();

  // 軌跡中文化
  const trajectoryText = (() => {
    if (!hit?.trajectory) return null;
    const map: Record<string, string> = {
      ground_ball: '滾地球',
      line_drive: '平飛球',
      fly_ball: '高飛球',
      popup: '小飛球',
      bunt_grounder: '觸擊滾地',
      bunt_line_drive: '觸擊平飛',
      bunt_popup: '觸擊小飛',
    };
    return map[hit.trajectory] ?? hit.trajectory;
  })();

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="text-xs text-gray-500 font-medium mb-3 flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        最後一球
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
        {/* 左：球速 + 球種 */}
        <div className="text-center">
          {startSpeed !== undefined ? (
            <>
              <div className="text-4xl font-black text-gray-800 tabular-nums leading-none">
                {startSpeed.toFixed(1)}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">mph</div>
            </>
          ) : (
            <div className="text-2xl text-gray-300">--</div>
          )}
          {pitchType && (
            <div className="mt-2 inline-block bg-gray-800 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {pitchTypeCode ? `${pitchTypeCode} · ` : ''}
              {pitchType}
            </div>
          )}
          {spinRate && (
            <div className="text-[10px] text-gray-400 mt-1.5">
              轉速 {spinRate.toLocaleString()} rpm
            </div>
          )}
        </div>

        {/* 中：好球帶 9 宮格 + 進壘點 */}
        <div className="flex flex-col items-center">
          <svg
            viewBox={`0 0 ${ZONE_VIEW.w} ${ZONE_VIEW.h}`}
            className="w-24 h-32"
          >
            {/* 外圍邊界（球員視野） */}
            <rect
              x="10"
              y="20"
              width="80"
              height="100"
              fill="#f9fafb"
              stroke="#e5e7eb"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
            {/* 好球帶 */}
            <rect
              x={ZONE_VIEW.cx - ZONE_VIEW.zoneW / 2}
              y={ZONE_VIEW.cy - ZONE_VIEW.zoneH / 2}
              width={ZONE_VIEW.zoneW}
              height={ZONE_VIEW.zoneH}
              fill="#ffffff"
              stroke="#374151"
              strokeWidth="1.2"
            />
            {/* 9 宮格內線 */}
            {[1, 2].map((i) => (
              <line
                key={`v${i}`}
                x1={ZONE_VIEW.cx - ZONE_VIEW.zoneW / 2 + (ZONE_VIEW.zoneW / 3) * i}
                y1={ZONE_VIEW.cy - ZONE_VIEW.zoneH / 2}
                x2={ZONE_VIEW.cx - ZONE_VIEW.zoneW / 2 + (ZONE_VIEW.zoneW / 3) * i}
                y2={ZONE_VIEW.cy + ZONE_VIEW.zoneH / 2}
                stroke="#d1d5db"
                strokeWidth="0.5"
              />
            ))}
            {[1, 2].map((i) => (
              <line
                key={`h${i}`}
                x1={ZONE_VIEW.cx - ZONE_VIEW.zoneW / 2}
                y1={ZONE_VIEW.cy - ZONE_VIEW.zoneH / 2 + (ZONE_VIEW.zoneH / 3) * i}
                x2={ZONE_VIEW.cx + ZONE_VIEW.zoneW / 2}
                y2={ZONE_VIEW.cy - ZONE_VIEW.zoneH / 2 + (ZONE_VIEW.zoneH / 3) * i}
                stroke="#d1d5db"
                strokeWidth="0.5"
              />
            ))}
            {/* 本壘板 */}
            <polygon
              points={`${ZONE_VIEW.cx - 18},128 ${ZONE_VIEW.cx + 18},128 ${ZONE_VIEW.cx + 14},135 ${ZONE_VIEW.cx},138 ${ZONE_VIEW.cx - 14},135`}
              fill="#ffffff"
              stroke="#6b7280"
              strokeWidth="0.8"
            />
            {/* 進壘點 */}
            {zoneCoord && (
              <>
                <circle
                  cx={zoneCoord.x}
                  cy={zoneCoord.y}
                  r="5"
                  fill={ballColor ?? '#1a56be'}
                  stroke="#fff"
                  strokeWidth="1.5"
                  className="mlb-pitch-pop"
                />
                <circle
                  cx={zoneCoord.x}
                  cy={zoneCoord.y}
                  r="9"
                  fill="none"
                  stroke={ballColor ?? '#1a56be'}
                  strokeWidth="1"
                  opacity="0.4"
                  className="mlb-pitch-ring"
                />
              </>
            )}
          </svg>
          <div className="text-[10px] text-gray-400 mt-0.5">投手視角</div>
        </div>

        {/* 右：結果 */}
        <div className="text-center">
          <div
            className={`inline-block text-sm font-bold border rounded-lg px-3 py-1.5 ${resultColor}`}
          >
            {resultText}
          </div>
          {/* 擊出去的資訊 */}
          {hit && (
            <div className="mt-2 space-y-0.5 text-[11px] text-gray-600">
              {hit.launchSpeed !== undefined && (
                <div>
                  初速{' '}
                  <span className="font-bold text-gray-800 tabular-nums">
                    {hit.launchSpeed.toFixed(1)}
                  </span>{' '}
                  mph
                </div>
              )}
              {hit.launchAngle !== undefined && (
                <div>
                  仰角{' '}
                  <span className="font-bold text-gray-800 tabular-nums">
                    {hit.launchAngle.toFixed(0)}°
                  </span>
                </div>
              )}
              {trajectoryText && (
                <div className="text-blue-600 font-medium">{trajectoryText}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 完整描述（英文） */}
      {description && (
        <div className="mt-3 pt-2 border-t border-gray-100 text-[11px] text-gray-400 italic text-center">
          {description}
        </div>
      )}

      <style jsx>{`
        :global(.mlb-pitch-pop) {
          animation: mlbPitchPop 0.5s ease-out;
          transform-origin: center;
          transform-box: fill-box;
        }
        @keyframes mlbPitchPop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.5); }
          100% { transform: scale(1); opacity: 1; }
        }
        :global(.mlb-pitch-ring) {
          animation: mlbPitchRing 1s ease-out;
          transform-origin: center;
          transform-box: fill-box;
        }
        @keyframes mlbPitchRing {
          0% { transform: scale(0.3); opacity: 0.8; }
          100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
