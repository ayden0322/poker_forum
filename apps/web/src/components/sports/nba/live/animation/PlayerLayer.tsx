'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AWAY_DOCK, HOME_DOCK, COURT_H, DOCK_H } from './court-coords';
import type { NBALivePlayer } from '../types';

/**
 * 球員當下動作（pose）— 決定 dock token 用哪段動畫
 *
 * - idle      : 預設、subtle 呼吸式 bobbing
 * - shooting  : 投籃—跳起 + 旋轉揚臂
 * - passing   : 傳球—水平擺動
 * - rebounding: 籃板—上下彈跳搶板
 * - celebrating: 得分後—連跳兩下
 * - blocked   : 被火鍋—頭往下沉
 */
export type PlayerPose =
  | 'idle'
  | 'shooting'
  | 'passing'
  | 'rebounding'
  | 'celebrating'
  | 'blocked';

interface Props {
  awayOnCourt: NBALivePlayer[];
  homeOnCourt: NBALivePlayer[];
  awayColor?: string;
  homeColor?: string;
  /** 高亮的球員 ID 集合（例如最後事件的當事人） */
  highlightedIds?: Set<number>;
  /** 球員 pose 對應表：personId → 動作類型，沒在表內 = idle */
  playerPoses?: Map<number, PlayerPose>;
}

const HEADSHOT = (personId: number) =>
  `https://cdn.nba.com/headshots/nba/latest/1040x760/${personId}.png`;

/**
 * 雙隊各 5 個 oncourt 球員的 Dock 渲染
 *
 * 設計變更（2026-06-01 設計顧問建議）：從「球場內 5v5 固定站位」改為「球場下方 dock」。
 * 後續迭代（2026-06-01 後續）：加 pose 動畫讓球員真的會動，不再靜止。
 *
 * 客隊 5 個在左、主隊 5 個在右、中間留空（視覺對應「對戰」隱喻）
 * 被高亮球員會放大 + 金邊脈衝、依 pose 觸發投籃/傳球/籃板/慶祝動作
 */
export function PlayerLayer({
  awayOnCourt,
  homeOnCourt,
  awayColor = '#dc2626',
  homeColor = '#2563eb',
  highlightedIds = new Set(),
  playerPoses = new Map(),
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
              pose={playerPoses.get(p.personId) ?? 'idle'}
              // 每個球員 idle bobbing 用「個人化延遲」避免整排同步浮動，像浪潮
              idlePhase={(i * 0.4) % 2}
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
              pose={playerPoses.get(p.personId) ?? 'idle'}
              idlePhase={(i * 0.4 + 1) % 2}
            />
          );
        })}
      </AnimatePresence>
    </g>
  );
}

/**
 * Dock 上的單個球員 token：頭像 + 號碼徽章 + pose 動畫
 *
 * pose 動畫用 framer-motion `animate` prop 切換、各 pose 有不同 keyframes：
 * - idle      : y bobbing ±2px、慢呼吸（2s 一循環）
 * - shooting  : y -28 + scale 1.15 + rotateZ 20° → 0°（揚臂投球感）
 * - passing   : y -6 + x ±10 擺動（傳球前的後仰）
 * - rebounding: 連跳兩次 y -16 → 0 → -10 → 0
 * - celebrating: y -22 + rotateZ ±8° 連跳三次（得分慶祝）
 * - blocked   : y +6 + scale 0.92（被擋下、下沉感）
 */
function DockToken({
  player,
  x,
  y,
  teamColor,
  highlighted,
  pose,
  idlePhase,
}: {
  player: NBALivePlayer;
  x: number;
  y: number;
  teamColor: string;
  highlighted: boolean;
  pose: PlayerPose;
  idlePhase: number;
}) {
  const baseSize = 38;
  const size = highlighted ? baseSize + 6 : baseSize;
  const half = size / 2;

  // pose → animate 屬性 mapping
  const poseAnimate = (() => {
    switch (pose) {
      case 'shooting':
        return {
          y: [0, -28, -12, 0],
          scale: [1, 1.15, 1.08, 1],
          rotate: [0, 22, 8, 0],
        };
      case 'passing':
        return {
          y: [0, -6, -4, 0],
          x: [0, 14, -6, 0],
        };
      case 'rebounding':
        return {
          y: [0, -18, -2, -12, 0],
          scale: [1, 1.08, 1, 1.05, 1],
        };
      case 'celebrating':
        return {
          y: [0, -22, -4, -18, -2, 0],
          rotate: [0, -8, 8, -6, 6, 0],
          scale: [1, 1.1, 1, 1.08, 1, 1],
        };
      case 'blocked':
        return {
          y: [0, 6, 4],
          scale: [1, 0.92, 0.96],
        };
      case 'idle':
      default:
        // 微幅 bobbing + 個人化延遲，整排球員不會整齊同步浮動
        return {
          y: [0, -2.5, 0, 2, 0],
        };
    }
  })();

  const poseTransition = (() => {
    switch (pose) {
      case 'shooting':
        return { duration: 0.9, ease: 'easeOut' as const };
      case 'passing':
        return { duration: 0.55, ease: 'easeOut' as const };
      case 'rebounding':
        return { duration: 0.85, ease: 'easeOut' as const };
      case 'celebrating':
        return { duration: 1.4, ease: 'easeInOut' as const };
      case 'blocked':
        return { duration: 0.5, ease: 'easeOut' as const };
      case 'idle':
      default:
        return {
          duration: 3.2,
          ease: 'easeInOut' as const,
          repeat: Infinity,
          delay: idlePhase,
        };
    }
  })();

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
          cy={y}
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

      {/* 球員整體：pose 動畫包在這層
          注意：transformBox / transformOrigin 設成球員中心，讓 rotate/scale 都繞中心 */}
      <motion.g
        animate={poseAnimate}
        transition={poseTransition}
        style={{
          transformBox: 'fill-box',
          transformOrigin: `${x}px ${y}px`,
        }}
      >
        {/* 頭像背景圓圈 */}
        <circle
          cx={x}
          cy={y}
          r={half}
          fill="#ffffff"
          stroke={teamColor}
          strokeWidth="2.5"
        />

        {/* 頭像 */}
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

        {/* 號碼徽章（移到頭像下方、不再覆蓋頭像） */}
        {player.jerseyNum && (
          <g>
            <rect
              x={x - 13}
              y={y + half + 1}
              width={26}
              height={12}
              rx={6}
              fill={teamColor}
            />
            <text
              x={x}
              y={y + half + 10}
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
    </motion.g>
  );
}
