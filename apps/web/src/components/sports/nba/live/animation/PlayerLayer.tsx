'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AWAY_DOCK, HOME_DOCK, COURT_H, DOCK_H } from './court-coords';
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
 * 雙隊各 5 個 oncourt 球員的 Dock 渲染
 *
 * 設計變更（2026-06-01）：從「球場內 5v5 固定站位」改為「球場下方 dock」。
 * 原因：依 personId hash 分站位有 96% 機率球員疊圖、且站位跟 NBA 實際位置無關。
 * 解法：放棄「球員在球場上」假設，球員 dock 一排、球場 SVG 只放球+軌跡+特效。
 *
 * 客隊 5 個在左、主隊 5 個在右、中間留空（視覺對應「對戰」隱喻）
 * 被高亮球員會放大 + 金邊脈衝（事件當事人視覺反饋）
 */
export function PlayerLayer({
  awayOnCourt,
  homeOnCourt,
  awayColor = '#dc2626',
  homeColor = '#2563eb',
  highlightedIds = new Set(),
}: Props) {
  return (
    <g className="player-dock">
      {/* Dock 背景分隔（淡色橫條，視覺暗示「這是 dock 區、不是球場」） */}
      <rect
        x={0}
        y={COURT_H}
        width={1000}
        height={DOCK_H}
        fill="#fffdf5"
        opacity={0.45}
      />
      <line
        x1={0}
        y1={COURT_H}
        x2={1000}
        y2={COURT_H}
        stroke="#5a4a2a"
        strokeWidth="1.2"
        opacity={0.6}
      />

      {/* 客隊 dock 標籤 */}
      <text
        x={250}
        y={COURT_H + 14}
        textAnchor="middle"
        fontSize="11"
        fontWeight="bold"
        fill="#5a4a2a"
        opacity={0.6}
      >
        客隊上場
      </text>
      {/* 主隊 dock 標籤 */}
      <text
        x={750}
        y={COURT_H + 14}
        textAnchor="middle"
        fontSize="11"
        fontWeight="bold"
        fill="#5a4a2a"
        opacity={0.6}
      >
        主隊上場
      </text>

      <AnimatePresence mode="sync">
        {awayOnCourt.slice(0, 5).map((p, i) => {
          const slot = AWAY_DOCK[i];
          return (
            <DockToken
              key={`away-${p.personId}`}
              player={p}
              x={slot.x}
              y={slot.y}
              teamColor={awayColor}
              highlighted={highlightedIds.has(p.personId)}
            />
          );
        })}
        {homeOnCourt.slice(0, 5).map((p, i) => {
          const slot = HOME_DOCK[i];
          return (
            <DockToken
              key={`home-${p.personId}`}
              player={p}
              x={slot.x}
              y={slot.y}
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
 * Dock 上的單個球員 token：頭像 + 號碼徽章
 *
 * 高亮時放大 + 上升一點點（像「跳起來」）+ 金邊脈衝
 */
function DockToken({
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
  const baseSize = 38;
  const size = highlighted ? baseSize + 8 : baseSize;
  const half = size / 2;
  const liftY = highlighted ? y - 6 : y;

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      style={{ transformBox: 'fill-box' }}
    >
      {/* 高亮金圈脈衝（事件當事人標記） */}
      {highlighted && (
        <circle
          cx={x}
          cy={liftY}
          r={half + 5}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2.5"
        >
          <animate
            attributeName="r"
            values={`${half + 5};${half + 9};${half + 5}`}
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

      {/* 頭像背景圓圈 */}
      <circle
        cx={x}
        cy={liftY}
        r={half}
        fill="#ffffff"
        stroke={teamColor}
        strokeWidth="2.5"
      />

      {/* 頭像 */}
      <foreignObject
        x={x - half + 2}
        y={liftY - half + 2}
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

      {/* 號碼徽章（移到頭像下方、不再覆蓋頭像） */}
      {player.jerseyNum && (
        <g>
          <rect
            x={x - 13}
            y={liftY + half + 1}
            width={26}
            height={12}
            rx={6}
            fill={teamColor}
          />
          <text
            x={x}
            y={liftY + half + 10}
            textAnchor="middle"
            fontSize="9"
            fontWeight="bold"
            fill="#ffffff"
          >
            #{player.jerseyNum}
          </text>
        </g>
      )}
    </motion.g>
  );
}
