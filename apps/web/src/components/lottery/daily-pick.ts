/**
 * 每日 deterministic 隨機選號
 *
 * 設計：
 * - 用「日期 + 彩種 + variant」hash 當 seed
 * - 同一天全站使用者看到相同號碼，每天 00:00 (台灣時區) 自動換組
 * - 0 後端、0 API、純 client 計算
 */

import type { LotteryMeta } from './lottery-meta';

/** mulberry32 — 輕量 seeded PRNG */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash，把字串轉穩定數字 */
function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 取今日日期字串（台灣時區），格式 YYYY-MM-DD */
export function todayKey(refDate?: Date): string {
  const d = refDate ?? new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

/** 從 [min, max] 範圍內 deterministic 取出 count 個不重複數字並排序 */
function pickNFromRange(seed: number, min: number, max: number, count: number): number[] {
  const rnd = mulberry32(seed);
  const all = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count).sort((a, b) => a - b);
}

export interface DailyPick {
  numbers: number[];
  specialNum?: number[];
  label: string;
  seedDate: string;
}

/**
 * 取得某彩種的「今日隨機推薦組合」
 * @param meta 彩種 metadata
 * @param variant 0/1，同一天可有多組推薦
 */
export function getDailyPick(meta: LotteryMeta, variant = 0, refDate?: Date): DailyPick {
  const dateKey = todayKey(refDate);
  const baseSeed = strHash(`${dateKey}:${meta.type}:${variant}`);
  const numbers = pickNFromRange(baseSeed, meta.ballRange.main[0], meta.ballRange.main[1], meta.ballRange.mainCount);
  let specialNum: number[] | undefined;
  if (meta.ballRange.special && meta.ballRange.specialCount) {
    const sSeed = strHash(`${dateKey}:${meta.type}:${variant}:special`);
    specialNum = pickNFromRange(sSeed, meta.ballRange.special[0], meta.ballRange.special[1], meta.ballRange.specialCount);
  }
  const labels = ['幸運組合 #1', '幸運組合 #2'];
  return {
    numbers,
    specialNum,
    label: labels[variant] ?? `幸運組合 #${variant + 1}`,
    seedDate: dateKey,
  };
}
