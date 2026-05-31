'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { COURT_W, COURT_H, COURT_CX, COURT_CY } from './court-coords';

export interface BannerMessage {
  /** 唯一 key（決定 AnimatePresence 識別） */
  id: string;
  /** 主標題（大字） */
  title: string;
  /** 副標題（小字、可選） */
  subtitle?: string;
  /** 背景色 */
  bgColor?: string;
  /** 字色 */
  textColor?: string;
}

interface Props {
  banner: BannerMessage | null;
}

/**
 * 全螢幕大字幕（蓋住整個球場 SVG）
 *
 * 用於事件如：
 * - 比賽結束（"END / 比賽結束"）
 * - 節結束（"Q2 END / 第 2 節結束"）
 * - 暫停（"TIMEOUT / 暫停"）
 * - 進球大勝（"BUZZER BEATER / 壓哨進球"）
 *
 * 短暫顯示 ~2 秒淡入淡出，不阻擋其他動畫
 */
export function BannerLayer({ banner }: Props) {
  return (
    <AnimatePresence>
      {banner && (
        <motion.g
          key={banner.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* 半透明黑底蓋住球場 */}
          <rect
            x={0}
            y={0}
            width={COURT_W}
            height={COURT_H}
            fill={banner.bgColor ?? '#000000'}
            opacity={0.78}
          />
          {/* 主標題 */}
          <motion.text
            x={COURT_CX}
            y={COURT_CY - 20}
            textAnchor="middle"
            fontSize="70"
            fontWeight="900"
            fill={banner.textColor ?? '#fbbf24'}
            stroke="#000"
            strokeWidth="2"
            paintOrder="stroke"
            initial={{ scale: 0.5, y: COURT_CY - 80 }}
            animate={{ scale: 1, y: COURT_CY - 20 }}
            transition={{ type: 'spring', stiffness: 120, damping: 14 }}
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'center',
              letterSpacing: '0.04em',
            }}
          >
            {banner.title}
          </motion.text>
          {/* 副標題 */}
          {banner.subtitle && (
            <text
              x={COURT_CX}
              y={COURT_CY + 50}
              textAnchor="middle"
              fontSize="22"
              fontWeight="600"
              fill="#ffffff"
              opacity={0.85}
            >
              {banner.subtitle}
            </text>
          )}
        </motion.g>
      )}
    </AnimatePresence>
  );
}
