'use client';

import type { CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth';

export type Rarity = 'COMMON' | 'RARE' | 'LEGENDARY';
export type CosmeticType = 'FRAME' | 'BADGE' | 'TITLE' | 'EFFECT';

/**
 * 頭像框圖檔配件「定位」：每個配件在頭像上的縮放與偏移（dx/dy 為頭像尺寸的比例）。
 * 桂冠包下半、翼章兩側貫穿、王冠頂部、盾徽右下角——各自不同，故按素材檔名查表。
 * 未來多媒體圖庫上線後，這個 placement 改存進品項資料；現階段先用前端表(僅 4 個已知素材)。
 */
export interface FramePlacement { scale: number; dx: number; dy: number }
const FRAME_PLACEMENTS: Record<string, FramePlacement> = {
  'laurel-wreath-full.png': { scale: 1.5, dx: 0, dy: 0 },       // 全環桂冠：孔(圖0.72)×1.5≈頭像1.08倍，環套外圈
  'laurel-wreath-gold.png': { scale: 1.62, dx: 0, dy: 0.06 },   // (舊半環，保留相容)
  'wings-teal-v2.png':      { scale: 1.58, dx: 0, dy: -0.10 },  // 翼章v2：中央大孔、雙翼貼頭貼上半
  'wings-teal.png':         { scale: 1.85, dx: 0, dy: 0 },      // (舊版,中心會擋頭貼)
  'crown-gold.png':         { scale: 0.82, dx: 0, dy: -0.58 },  // 王冠：縮小、上移、戴頭頂
  'shield-emblem.png':      { scale: 0.55, dx: 0.33, dy: 0.33 },// 盾徽：縮小、右下角
  'wings-emblem.png':       { scale: 0.58, dx: 0.32, dy: 0.32 },// 翼徽：右下角徽章(不框頭像)
  'laurel-emblem.png':      { scale: 0.58, dx: 0.32, dy: 0.32 },// 桂冠徽：右下角徽章
  // 官方套組「三球金框」：方形相框，窗口≈框0.64；框放大1.56× → 窗口≈頭像1.0，把上傳圖裱在中央。
  'three-ball-frame.png':   { scale: 1.56, dx: 0, dy: 0 },
};
export function framePlacement(assetUrl: string): FramePlacement {
  const base = assetUrl.split('/').pop() ?? '';
  return FRAME_PLACEMENTS[base] ?? { scale: 1.55, dx: 0, dy: 0 }; // 預設置中包覆
}

/**
 * 框的「頭像形狀」：圓形環(桂冠/翼章等)讓頭像維持圓形；方形相框(three-ball-frame)則把
 * 上傳圖裱成圓角方形填滿相框窗口——像真正的相框把照片裱起來，對「裝飾裱著你的圖」語意最貼。
 */
export type FrameShape = 'circle' | 'square';
const FRAME_SHAPES: Record<string, FrameShape> = {
  'three-ball-frame.png': 'square',
};
export function frameShape(assetUrl?: string | null): FrameShape {
  if (!assetUrl) return 'circle';
  return FRAME_SHAPES[assetUrl.split('/').pop() ?? ''] ?? 'circle';
}

// 註：特效已改為獨立可選購的 EFFECT 裝飾類型(獨立槽，疊在任何框上)，
// 不再綁定特定框；渲染由 AvatarWithFrame 的 effectUrl prop 驅動。

export const RARITY_LABEL: Record<Rarity, string> = { COMMON: '普通', RARE: '稀有', LEGENDARY: '傳說' };

/**
 * 稀有度視覺 token（對齊 brand-preferences「博客邦裝飾系統視覺規範」）。
 * 描邊/扁平/低飽和；普通灰、稀有青綠 #39B8BE、傳說金 #d97706（禁紫、禁立體發光）。
 */
// 浮誇度修訂 2026-06-21：普通靜態、稀有加雙層厚度、傳說走 conic 漸層（在 AvatarWithFrame 內處理，
// 此處 LEGENDARY 留空物件僅為型別完整；元件偵測 rarity==='LEGENDARY' 走漸層分支）。
export const FRAME_RING: Record<Rarity, CSSProperties> = {
  COMMON: { border: '1.5px solid #9CA3AF' },
  RARE: { border: '2px solid #39B8BE', boxShadow: '0 0 0 3px rgba(57,184,190,0.18)' },
  LEGENDARY: {},
};
export const BADGE_TOKEN: Record<Rarity, { stroke: string; border: string; bg: string }> = {
  COMMON: { stroke: '#6B7280', border: '#E5E7EB', bg: '#F9FAFB' },
  RARE: { stroke: '#39B8BE', border: '#39B8BE', bg: 'rgba(57,184,190,0.08)' },
  LEGENDARY: { stroke: '#d97706', border: '#d97706', bg: 'rgba(217,119,6,0.08)' },
};
export const TITLE_TOKEN: Record<Rarity, CSSProperties> = {
  COMMON: { color: '#6B7280', fontWeight: 500 },
  RARE: { color: '#39B8BE', fontWeight: 600 },
  LEGENDARY: { color: '#d97706', fontWeight: 600 },
};

// 作者列/頭像顯示用：隨作者資料一起來的「已裝備」精簡形
export interface AuthorCosmetics {
  frame: { rarity: Rarity; assetUrl: string | null } | null;
  title: { name: string; rarity: Rarity } | null;
  mainBadge: { iconKey: string | null; assetUrl: string | null; rarity: Rarity } | null;
  effect: { assetUrl: string | null } | null;
}

export interface ShopItem {
  id: string; type: CosmeticType; name: string; description: string | null;
  iconKey: string | null; assetUrl: string | null; rarity: Rarity; priceG: number | null; levelRequired: number | null;
  owned: boolean; affordable: boolean;
}
export interface InventoryItem {
  itemId: string; type: CosmeticType; name: string; iconKey: string | null; assetUrl: string | null; rarity: Rarity;
  source: string; equippedSlot: 'FRAME' | 'TITLE' | 'EFFECT' | null; isMainBadge: boolean; pinnedOrder: number | null;
}

export function useShop(type?: CosmeticType) {
  const { user, accessToken } = useAuth();
  return useQuery<{ data: { enabled: boolean; balanceG?: number; items: ShopItem[] } }>({
    queryKey: ['cosmetics', 'shop', type ?? 'all', user?.id],
    queryFn: () => apiFetch(`/cosmetics/shop${type ? `?type=${type}` : ''}`),
    enabled: !!accessToken && !!user?.id,
  });
}
export function useInventory() {
  const { user, accessToken } = useAuth();
  return useQuery<{ data: { enabled: boolean; items: InventoryItem[] } }>({
    queryKey: ['cosmetics', 'inventory', user?.id],
    queryFn: () => apiFetch('/cosmetics/inventory'),
    enabled: !!accessToken && !!user?.id,
  });
}

/** 購買/裝備/釘選後，刷新 shop+inventory+member+作者相關快取 */
export function useCosmeticActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cosmetics'] });
    qc.invalidateQueries({ queryKey: ['member'] });
    qc.invalidateQueries({ queryKey: ['post'] });
    qc.invalidateQueries({ queryKey: ['user'] });
  };
  const purchase = useMutation({
    mutationFn: (itemId: string) => apiFetch('/cosmetics/purchase', { method: 'POST', body: JSON.stringify({ itemId }) }),
    onSuccess: invalidate,
  });
  const equip = useMutation({
    mutationFn: (v: { type: 'FRAME' | 'TITLE' | 'EFFECT'; itemId: string | null }) =>
      apiFetch('/cosmetics/equip', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: invalidate,
  });
  const pin = useMutation({
    mutationFn: (v: { pinnedIds: string[]; mainBadgeId?: string | null }) =>
      apiFetch('/cosmetics/badges/pin', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: invalidate,
  });
  return { purchase, equip, pin };
}
