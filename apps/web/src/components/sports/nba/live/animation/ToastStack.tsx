'use client';

import { motion, AnimatePresence } from 'framer-motion';

export interface ToastMessage {
  id: number; // 用 actionNumber 當 id 確保唯一
  title: string; // 主標（如「火鍋」「抄截」）
  subtitle?: string; // 副標（如球員名）
  color?: string; // 主色（左邊豎條）
  icon?: string; // emoji 或縮寫
}

interface Props {
  toasts: ToastMessage[];
}

/**
 * 球場上方右側的事件 toast 浮窗堆疊
 *
 * 用於非投籃事件的通知：
 * - 火鍋（Block）
 * - 抄截（Steal）
 * - 失誤（Turnover）
 * - 犯規（Foul）
 * - 換人（Substitution）
 * - 暫停（Timeout）
 *
 * 上面新事件 slide-in、舊事件往下淡出
 */
export function ToastStack({ toasts }: Props) {
  return (
    <div className="absolute top-2 right-2 flex flex-col gap-1.5 pointer-events-none z-10 max-w-[200px]">
      <AnimatePresence initial={false}>
        {toasts.slice(-3).map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 60, scale: 0.85 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30, scale: 0.85 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 px-3 py-2 flex items-center gap-2"
            style={{
              borderLeftWidth: 4,
              borderLeftColor: t.color ?? '#6366f1',
            }}
          >
            {t.icon && (
              <span
                className="text-base font-black flex-shrink-0"
                style={{ color: t.color ?? '#6366f1' }}
              >
                {t.icon}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-gray-800 truncate leading-tight">
                {t.title}
              </div>
              {t.subtitle && (
                <div className="text-[10px] text-gray-500 truncate leading-tight">
                  {t.subtitle}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
