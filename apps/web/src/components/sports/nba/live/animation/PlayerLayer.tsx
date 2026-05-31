'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  HOME_POSITIONS,
  AWAY_POSITIONS,
  positionIndexForPlayer,
} from './court-coords';
import type { NBALivePlayer } from '../types';

interface Props {
  awayOnCourt: NBALivePlayer[];
  homeOnCourt: NBALivePlayer[];
  awayColor?: string;
  homeColor?: string;
  /** 高亮的球員 ID 集合（例如最後事件的當事人） */
  highlightedIds?: Set<number>;
}

const HEADSHOT = (personId: number) =>
  `https://cdn.nba.com/headshots/nba/latest/1040x760/${personId}.png`;

/**
 * 在球場 SVG 上渲染雙方各 5 個在場球員
 *
 * - 每隊 5 個球員依 positionIndexForPlayer(personId) 分配到 5 個固定站位
 * - 球員小頭像 + 號碼徽章
 * - 換人時用 AnimatePresence 做淡入淡出（同 personId 不會重畫）
 * - 高亮球員（最後事件當事人）會放大 + 加金邊
 *
 * 注意：要嵌在 SVG <g> 內使用，因為內部用 <foreignObject> 渲染 React 頭像
 */
export function PlayerLayer({
  awayOnCourt,
  homeOnCourt,
  awayColor = '#dc2626',
  homeColor = '#2563eb',
  highlightedIds = new Set(),
}: Props) {
  return (
    <g className="player-layer">
      <AnimatePresence mode="sync">
        {awayOnCourt.slice(0, 5).map((p) => {
          const pos = AWAY_POSITIONS[positionIndexForPlayer(p.personId)];
          return (
            <PlayerToken
              key={`away-${p.personId}`}
              player={p}
              x={pos.x}
              y={pos.y}
              teamColor={awayColor}
              highlighted={highlightedIds.has(p.personId)}
            />
          );
        })}
        {homeOnCourt.slice(0, 5).map((p) => {
          const pos = HOME_POSITIONS[positionIndexForPlayer(p.personId)];
          return (
            <PlayerToken
              key={`home-${p.personId}`}
              player={p}
              x={pos.x}
              y={pos.y}
              teamColor={homeColor}
              highlighted={highlightedIds.has(p.personId)}
            />
          );
        })}
      </AnimatePresence>
    </g>
  );
}

/**
 * 單一球員 token：頭像 + 號碼徽章
 *
 * 用 SVG foreignObject 嵌入 HTML img（NBA cdn 圖片），這樣可以直接顯示頭像
 * 而不用轉成 SVG image href（後者跨域有限制）。
 */
function PlayerToken({
  player,
  x,
  y,
  teamColor,
  highlighted,
}: {
  player: NBALivePlayer;
  x: number;
  y: number;
  teamColor: string;
  highlighted: boolean;
}) {
  const size = highlighted ? 44 : 36;
  const half = size / 2;

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        opacity: 1,
        scale: 1,
        // 用 transform 移動位置而非 x/y 屬性，避免每次重渲染都跳
      }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{ transformBox: 'fill-box' }}
    >
      {/* 高亮外圈（金邊 + 脈衝） */}
      {highlighted && (
        <circle
          cx={x}
          cy={y}
          r={half + 4}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2.5"
        >
          <animate
            attributeName="r"
            values={`${half + 4};${half + 8};${half + 4}`}
            dur="1.2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="1;0.4;1"
            dur="1.2s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* 頭像背景圓圈（隊伍色邊框） */}
      <circle
        cx={x}
        cy={y}
        r={half}
        fill="#ffffff"
        stroke={teamColor}
        strokeWidth="2.5"
      />

      {/* 頭像（用 foreignObject 嵌入 img、允許跨域圖片） */}
      <foreignObject
        x={x - half + 2}
        y={y - half + 2}
        width={size - 4}
        height={size - 4}
        style={{ pointerEvents: 'none' }}
      >
        <img
          src={HEADSHOT(player.personId)}
          alt={player.nameZhTw}
          width={size - 4}
          height={size - 4}
          style={{
            borderRadius: '50%',
            objectFit: 'cover',
            background: '#f3f4f6',
            display: 'block',
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
          }}
        />
      </foreignObject>

      {/* 號碼徽章（右下角） */}
      {player.jerseyNum && (
        <g>
          <circle
            cx={x + half - 4}
            cy={y + half - 4}
            r={9}
            fill={teamColor}
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          <text
            x={x + half - 4}
            y={y + half - 1}
            textAnchor="middle"
            fontSize="10"
            fontWeight="bold"
            fill="#ffffff"
          >
            {player.jerseyNum}
          </text>
        </g>
      )}
    </motion.g>
  );
}
