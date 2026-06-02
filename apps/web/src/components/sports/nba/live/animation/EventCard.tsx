'use client';

import { motion, AnimatePresence } from 'framer-motion';

/**
 * 投籃 / 罰球字卡（核心視覺）
 *
 * 設計轉向（2026-06-01 Ayden 決定）：
 * 從「5v5 dock + 動畫直播」改成「事件聚焦字卡」。
 * 不再呈現所有球員位置，只在投籃 / 罰球時跳出一張字卡顯示：
 *   - 球員頭像
 *   - 球員姓名（中文 / 縮寫）
 *   - 動作中文（灌籃 / 上籃 / 跳投 / 後撤步 / 罰球...）
 *   - 加分 chip（+1 / +2 / +3）
 *
 * 字卡在球場中央偏下出現，持續 2~2.5 秒淡出。
 */

export interface EventCardData {
  /** 唯一 key（AnimatePresence 識別、用 actionNumber） */
  id: number;
  /** 球員頭像 URL */
  headshotUrl?: string;
  /** 球員顯示名（已中文化） */
  playerName: string;
  /** 動作中文（如「切入上籃」「後撤步跳投」） */
  actionLabel: string;
  /** 得分（0 = 未進、>0 = 命中） */
  points: number;
  /** 是否命中 */
  made: boolean;
  /** 主色（隊伍顏色） */
  teamColor: string;
  /** 球員 dock 位置（左/右）— 決定字卡靠哪邊偏移 */
  side: 'left' | 'right';
}

interface Props {
  card: EventCardData | null;
}

export function EventCard({ card }: Props) {
  return (
    <AnimatePresence>
      {card && (
        <motion.div
          key={card.id}
          initial={{ opacity: 0, scale: 0.85, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -10 }}
          transition={{
            duration: 0.4,
            ease: 'easeOut',
          }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20"
        >
          <div
            className="flex items-center gap-3 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl px-4 py-3 border-2"
            style={{ borderColor: card.teamColor, minWidth: 260 }}
          >
            {/* 球員頭像 */}
            <div
              className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0 border-2"
              style={{ borderColor: card.teamColor }}
            >
              {card.headshotUrl ? (
                <img
                  src={card.headshotUrl}
                  alt={card.playerName}
                  className="w-full h-full object-cover bg-gray-100"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.opacity =
                      '0.3';
                  }}
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: card.teamColor }}
                >
                  {card.playerName.slice(0, 1)}
                </div>
              )}
            </div>

            {/* 球員資訊 */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-gray-900 truncate">
                {card.playerName}
              </div>
              <div className="text-base font-black text-gray-800 mt-0.5">
                {card.actionLabel}
                {!card.made && (
                  <span className="ml-2 text-xs text-gray-500 font-medium">
                    未進
                  </span>
                )}
              </div>
            </div>

            {/* 加分 chip */}
            {card.made && card.points > 0 && (
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-black text-2xl shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${card.teamColor}, #1f2937)`,
                  width: 56,
                  height: 56,
                }}
              >
                +{card.points}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * 把 NBA cdn 的 actionType + subType 轉成中文動作標籤
 *
 * actionType: '2pt' / '3pt' / 'freethrow'
 * subType: NBA 給的英文（'Jump Shot' / 'Layup' / 'Dunk' / 'Hook' / ...）
 */
export function describeShot(
  actionType: string,
  subType: string | undefined,
): string {
  if (actionType === 'freethrow') {
    return '罰球';
  }

  const is3 = actionType === '3pt';
  const sub = (subType ?? '').toLowerCase();

  // 灌籃類
  if (sub.includes('dunk')) {
    if (sub.includes('alley oop')) return '空接灌籃';
    if (sub.includes('driving')) return '切入灌籃';
    if (sub.includes('cutting')) return '空切灌籃';
    if (sub.includes('reverse')) return '反手灌籃';
    if (sub.includes('tip')) return '補籃灌';
    return '灌籃';
  }

  // 補籃
  if (sub.includes('tip')) {
    if (sub.includes('layup')) return '補籃上籃';
    return '補籃';
  }

  // 上籃類
  if (sub.includes('layup')) {
    if (sub.includes('driving')) return '切入上籃';
    if (sub.includes('cutting')) return '空切上籃';
    if (sub.includes('reverse')) return '反手上籃';
    if (sub.includes('finger roll')) return '手指挑籃';
    if (sub.includes('putback')) return '補籃';
    if (sub.includes('alley oop')) return '空接上籃';
    if (sub.includes('floating')) return '拋投上籃';
    return '上籃';
  }

  // 勾射
  if (sub.includes('hook')) {
    if (sub.includes('running')) return '跑動勾射';
    if (sub.includes('driving')) return '切入勾射';
    return '勾射';
  }

  // 跳投類
  if (sub.includes('jump shot') || sub.includes('jumper')) {
    if (sub.includes('step back')) return is3 ? '後撤步三分' : '後撤步跳投';
    if (sub.includes('pullup') || sub.includes('pull-up')) {
      return is3 ? '急停三分' : '急停跳投';
    }
    if (sub.includes('fadeaway')) return is3 ? '後仰三分' : '後仰跳投';
    if (sub.includes('turnaround')) return '轉身跳投';
    if (sub.includes('driving')) return is3 ? '切入三分' : '切入跳投';
    if (sub.includes('floating')) return '拋投';
    if (sub.includes('running')) return '跑動跳投';
    return is3 ? '三分跳投' : '跳投';
  }

  // 拋投
  if (sub.includes('floating')) return '拋投';

  // 不知道 subType，用 actionType fallback
  return is3 ? '三分球' : '兩分球';
}
