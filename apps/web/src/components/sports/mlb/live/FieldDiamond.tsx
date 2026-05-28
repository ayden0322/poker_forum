'use client';

import type { LivePerson } from './types';

interface Props {
  onFirst: LivePerson | null;
  onSecond: LivePerson | null;
  onThird: LivePerson | null;
  outs: number;
  /** true = 客隊進攻（半局上半，攻方位於圖示外側） */
  isTopInning?: boolean;
}

/**
 * 棒球菱形場示意圖
 *
 * - 三個壘包，有跑者亮起並 pulse
 * - 出局數以中央三個小圓點呈現（亮起 = 已出局）
 * - 鑽石指向上方（本壘在下、二壘在上）
 */
export function FieldDiamond({ onFirst, onSecond, onThird, outs }: Props) {
  // 三個壘的中心點座標（在 200x200 viewBox 內）
  const bases = {
    first: { x: 150, y: 110, label: '1B', runner: onFirst },
    second: { x: 100, y: 60, label: '2B', runner: onSecond },
    third: { x: 50, y: 110, label: '3B', runner: onThird },
  };

  // 出局圓點
  const outIndicators = [0, 1, 2].map((i) => i < outs);

  return (
    <div className="relative w-full max-w-[260px] aspect-square mx-auto">
      <svg viewBox="0 0 200 200" className="w-full h-full">
        {/* 外野扇形（綠色草地） */}
        <path
          d="M 100 160 L 20 80 A 100 100 0 0 1 180 80 Z"
          fill="url(#fieldGradient)"
        />
        {/* 內野菱形（土色） */}
        <path
          d="M 100 160 L 50 110 L 100 60 L 150 110 Z"
          fill="#c89968"
          stroke="#a67a4d"
          strokeWidth="1"
        />
        {/* 投手丘 */}
        <circle cx="100" cy="110" r="9" fill="#a67a4d" stroke="#8a6238" strokeWidth="1" />
        <circle cx="100" cy="110" r="2" fill="#fff" opacity="0.7" />

        {/* 漸層定義 */}
        <defs>
          <radialGradient id="fieldGradient" cx="50%" cy="100%" r="100%">
            <stop offset="0%" stopColor="#5cb85c" />
            <stop offset="70%" stopColor="#3f9c3f" />
            <stop offset="100%" stopColor="#2d7a2d" />
          </radialGradient>
          <filter id="runnerGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 三個壘包 */}
        {Object.values(bases).map((b) => {
          const hasRunner = !!b.runner;
          return (
            <g
              key={b.label}
              transform={`translate(${b.x} ${b.y}) rotate(45)`}
              className={hasRunner ? 'mlb-base-pulse' : ''}
              filter={hasRunner ? 'url(#runnerGlow)' : undefined}
            >
              <rect
                x="-9"
                y="-9"
                width="18"
                height="18"
                fill={hasRunner ? '#fbbf24' : '#ffffff'}
                stroke={hasRunner ? '#f59e0b' : '#9ca3af'}
                strokeWidth="1.5"
              />
            </g>
          );
        })}

        {/* 本壘（五邊形） */}
        <polygon
          points="100,168 92,160 92,152 108,152 108,160"
          fill="#ffffff"
          stroke="#6b7280"
          strokeWidth="1.5"
        />
      </svg>

      {/* 出局數圓點（覆蓋在球場下方） */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        <span className="text-[10px] text-gray-500 font-medium mr-1">OUT</span>
        {outIndicators.map((on, i) => (
          <span
            key={i}
            className={`w-2.5 h-2.5 rounded-full border ${
              on
                ? 'bg-red-500 border-red-600 mlb-out-flash'
                : 'bg-white border-gray-300'
            }`}
          />
        ))}
      </div>

      {/* 跑者名字浮在壘包旁（縮寫顯示） */}
      {Object.values(bases).map((b) => {
        if (!b.runner) return null;
        const name = b.runner.shortName ?? b.runner.nameZhTw ?? b.runner.fullName;
        return (
          <div
            key={`name-${b.label}`}
            className="absolute text-[10px] font-bold text-amber-700 bg-white/90 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap pointer-events-none"
            style={{
              left: `${(b.x / 200) * 100}%`,
              top: `${(b.y / 200) * 100}%`,
              transform: 'translate(-50%, -180%)',
            }}
          >
            {name}
          </div>
        );
      })}

      <style jsx>{`
        :global(.mlb-base-pulse rect) {
          animation: mlbBasePulse 1.5s ease-in-out infinite;
        }
        @keyframes mlbBasePulse {
          0%, 100% { opacity: 1; transform-origin: center; }
          50% { opacity: 0.7; }
        }
        :global(.mlb-out-flash) {
          animation: mlbOutFlash 0.6s ease-out;
        }
        @keyframes mlbOutFlash {
          0% { transform: scale(1.6); box-shadow: 0 0 12px rgba(239,68,68,0.8); }
          100% { transform: scale(1); box-shadow: none; }
        }
      `}</style>
    </div>
  );
}
