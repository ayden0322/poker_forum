'use client';

interface Props {
  balls: number;
  strikes: number;
  outs: number;
  inning?: number;
  inningOrdinal?: string;
  isTopInning?: boolean;
  inningHalf?: string; // 'Top' / 'Bottom' / 'Middle' / 'End'
}

/**
 * B/S/O 計數指示器
 *
 * 三排彩色圓點：壞球（綠）、好球（黃）、出局（紅）
 * 上方顯示局數 ↑/↓ 與半局描述
 */
export function CountIndicator({
  balls,
  strikes,
  outs,
  inning,
  inningOrdinal,
  isTopInning,
  inningHalf,
}: Props) {
  // 半局中文化（Top→上 / Bottom→下 / Middle→換場 / End→局末）
  const halfLabel = (() => {
    if (inningHalf === 'Top' || isTopInning === true) return '上';
    if (inningHalf === 'Bottom' || isTopInning === false) return '下';
    if (inningHalf === 'Middle') return '換場';
    if (inningHalf === 'End') return '局末';
    return '';
  })();

  const inningText = inningOrdinal ?? (inning ? `${inning}` : '-');

  // 三排圓點通用渲染
  const dots = (label: string, value: number, max: number, colorOn: string, colorOff: string) => (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-bold text-gray-500 w-3">{label}</span>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => {
          const on = i < value;
          return (
            <span
              key={i}
              className={`w-3 h-3 rounded-full border transition-all ${
                on ? `${colorOn} mlb-count-pop` : colorOff
              }`}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="bg-gray-900 text-white rounded-xl p-3 flex items-center justify-between gap-4 shadow-md">
      {/* 局數區塊 */}
      <div className="flex items-center gap-2 px-3 border-r border-white/15">
        <span className="text-2xl font-black tabular-nums leading-none">
          {inningText}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[10px] text-gray-400 uppercase">Inning</span>
          <span className="text-sm font-bold text-amber-300">
            {halfLabel === '上' && '↑ 上'}
            {halfLabel === '下' && '↓ 下'}
            {halfLabel !== '上' && halfLabel !== '下' && halfLabel}
          </span>
        </span>
      </div>

      {/* B / S / O 三排 */}
      <div className="flex flex-col gap-1.5 flex-1">
        {dots(
          'B',
          balls,
          3,
          'bg-green-500 border-green-400 shadow-[0_0_6px_rgba(34,197,94,0.6)]',
          'bg-transparent border-gray-600',
        )}
        {dots(
          'S',
          strikes,
          2,
          'bg-amber-400 border-amber-300 shadow-[0_0_6px_rgba(251,191,36,0.6)]',
          'bg-transparent border-gray-600',
        )}
        {dots(
          'O',
          outs,
          3,
          'bg-red-500 border-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]',
          'bg-transparent border-gray-600',
        )}
      </div>

      <style jsx>{`
        :global(.mlb-count-pop) {
          animation: mlbCountPop 0.4s ease-out;
        }
        @keyframes mlbCountPop {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.3); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
