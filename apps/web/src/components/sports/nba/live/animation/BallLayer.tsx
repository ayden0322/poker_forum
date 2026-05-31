'use client';

import { motion } from 'framer-motion';

interface Props {
  /** 球的當前位置（SVG 座標） */
  x: number;
  y: number;
  /** 球的大小，預設 10 */
  size?: number;
  /** 是否「在飛」（飛行中不顯示陰影） */
  flying?: boolean;
}

/**
 * 籃球的視覺呈現 — 橘色圓 + 黑色十字線（模擬籃球紋路）
 *
 * 由 AnimationOrchestrator 控制位置與動畫：
 * - 起始位置：靜止在中圈
 * - 投籃時：用 framer-motion animate 從球員位置 → 籃框
 * - 傳球時：從球員 A → 球員 B
 */
export function BallLayer({ x, y, size = 11, flying = false }: Props) {
  return (
    <motion.g
      animate={{ x, y }}
      transition={{ type: 'spring', stiffness: 60, damping: 12 }}
      style={{ transformBox: 'fill-box' }}
    >
      {/* 球的陰影（靜止時顯示） */}
      {!flying && (
        <ellipse
          cx={0}
          cy={size + 2}
          rx={size * 0.7}
          ry={size * 0.25}
          fill="#000"
          opacity="0.2"
        />
      )}
      {/* 球本體 */}
      <circle
        cx={0}
        cy={0}
        r={size}
        fill="#f97316"
        stroke="#9a3412"
        strokeWidth="1.2"
      />
      {/* 籃球紋路（橫線 + 豎線 + 兩條弧） */}
      <line
        x1={-size}
        y1={0}
        x2={size}
        y2={0}
        stroke="#9a3412"
        strokeWidth="0.9"
      />
      <line
        x1={0}
        y1={-size}
        x2={0}
        y2={size}
        stroke="#9a3412"
        strokeWidth="0.9"
      />
      <path
        d={`M ${-size * 0.7} ${-size * 0.7} Q 0 0 ${-size * 0.7} ${size * 0.7}`}
        fill="none"
        stroke="#9a3412"
        strokeWidth="0.7"
      />
      <path
        d={`M ${size * 0.7} ${-size * 0.7} Q 0 0 ${size * 0.7} ${size * 0.7}`}
        fill="none"
        stroke="#9a3412"
        strokeWidth="0.7"
      />
    </motion.g>
  );
}
