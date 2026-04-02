'use client';

/** 號碼球顏色：依號碼範圍分色 */
function getBallColor(num: number, isSpecial?: boolean): string {
  if (isSpecial) return 'bg-red-500 text-white';
  if (num <= 9) return 'bg-yellow-400 text-gray-900';
  if (num <= 19) return 'bg-blue-500 text-white';
  if (num <= 29) return 'bg-green-500 text-white';
  if (num <= 39) return 'bg-purple-500 text-white';
  return 'bg-orange-500 text-white';
}

interface LotteryBallProps {
  number: number;
  isSpecial?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function LotteryBall({ number, isSpecial, size = 'md' }: LotteryBallProps) {
  const sizeClass = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-11 h-11 text-base',
  }[size];

  return (
    <span
      className={`
        inline-flex items-center justify-center rounded-full font-bold shadow-sm
        ${getBallColor(number, isSpecial)}
        ${sizeClass}
      `}
    >
      {String(number).padStart(2, '0')}
    </span>
  );
}
