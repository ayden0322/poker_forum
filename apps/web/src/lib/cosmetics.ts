'use client';

import type { CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth';

export type Rarity = 'COMMON' | 'RARE' | 'LEGENDARY';
export type CosmeticType = 'FRAME' | 'BADGE' | 'TITLE';

export const RARITY_LABEL: Record<Rarity, string> = { COMMON: '普通', RARE: '稀有', LEGENDARY: '傳說' };

/**
 * 稀有度視覺 token（對齊 brand-preferences「博客邦裝飾系統視覺規範」）。
 * 描邊/扁平/低飽和；普通灰、稀有青綠 #39B8BE、傳說金 #d97706（禁紫、禁立體發光）。
 */
export const FRAME_RING: Record<Rarity, CSSProperties> = {
  COMMON: { border: '1.5px solid #9CA3AF' },
  RARE: { border: '2px solid #39B8BE' },
  LEGENDARY: { border: '1px solid #d97706', boxShadow: '0 0 0 1px #d9770633' },
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
  frame: { rarity: Rarity } | null;
  title: { name: string; rarity: Rarity } | null;
  mainBadge: { iconKey: string; rarity: Rarity } | null;
}

export interface ShopItem {
  id: string; type: CosmeticType; name: string; description: string | null;
  iconKey: string | null; rarity: Rarity; priceG: number | null; levelRequired: number | null;
  owned: boolean; affordable: boolean;
}
export interface InventoryItem {
  itemId: string; type: CosmeticType; name: string; iconKey: string | null; rarity: Rarity;
  source: string; equippedSlot: 'FRAME' | 'TITLE' | null; isMainBadge: boolean; pinnedOrder: number | null;
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
    mutationFn: (v: { type: 'FRAME' | 'TITLE'; itemId: string | null }) =>
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
