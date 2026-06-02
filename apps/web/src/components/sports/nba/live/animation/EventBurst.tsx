'use client';

import { motion, AnimatePresence } from 'framer-motion';

export interface BurstMessage {
  /** 唯一 key (actionNumber) */
  id: number;
  /** 主大字（STEAL / BLOCKED / TURNOVER / OUT / FOUL） */
  text: string;
  /** 副標（球員名 / 簡述） */
  subtitle?: string;
  /** 主色 */
  color: string;
}

interface Props {
  burst: BurstMessage | null;
}

/**
 * 事件特效中央大字（介於 banner 跟 toast 之間）
 *
 * 用於需要「強調但不蓋整場」的事件：
 * - STEAL（抄截）— 綠色
 * - BLOCKED（火鍋）— 紫色
 * - TURNOVER（失誤）— 灰色
 * - OUT OF BOUNDS（出界）— 橘色
 * - FOUL（犯規）— 橘色
 *
 * 視覺特點：
 * - 球場中央橫條大字，半透明深色背景
 * - 從左側 slide-in、停 0.9s、淡出
 * - 主大字英文、副標中文 + 球員名
 */
export function EventBurst({ burst }: Props) {
  return (
    <AnimatePresence>
      {burst && (
        <motion.div
          key={burst.id}
          initial={{ opacity: 0, x: -40, scale: 0.92 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 30, scale: 0.95 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30"
        >
          <div
            className="flex flex-col items-center gap-1 px-6 py-3 rounded-xl shadow-2xl"
            style={{
              background: `linear-gradient(135deg, ${burst.color}, #1f2937)`,
              minWidth: 220,
            }}
          >
            <div
              className="text-3xl sm:text-4xl font-black text-white tracking-widest"
              style={{ textShadow: '0 2px 6px rgba(0,0,0,0.4)' }}
            >
              {burst.text}
            </div>
            {burst.subtitle && (
              <div className="text-xs text-white/85 font-medium tracking-wide">
                {burst.subtitle}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
