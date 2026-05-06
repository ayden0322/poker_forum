'use client';

/**
 * 「+ 新增號碼組」Modal
 *
 * 流程：
 * 1. 選彩種（大樂透 / 威力彩 / 今彩 539 / 雙贏彩 / 3 星彩 / 4 星彩）
 * 2. 選號碼（grid 點擊 toggle，主號碼 + 特別號分區）
 * 3. 命名（label，限 30 字）
 * 4. 儲存（呼叫 POST /lottery/my-picks）
 *
 * 號碼選擇規則：
 * - 主號碼：點擊 toggle，達到 mainCount 後再點要先取消
 * - 特別號：點擊 toggle，最多 1 個
 * - 3 星彩 / 4 星彩：允許重複（用「+1 / -1」按鈕代替 toggle）
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { LotteryBall } from './LotteryBall';
import { GameIcon } from './GameIcon';
import { LOTTERY_META, getMetaByType } from './lottery-meta';

interface Props {
  defaultGameType: string;
  onClose: () => void;
  onCreated: () => void;
}

// 整理出可選彩種（不含已停售）
const SELECTABLE_TYPES = ['LOTTO649', 'SUPER_LOTTO', 'DAILY539', 'LOTTO3D', 'LOTTO4D'] as const;

export function MyPickModal({ defaultGameType, onClose, onCreated }: Props) {
  const [gameType, setGameType] = useState<string>(
    SELECTABLE_TYPES.includes(defaultGameType as (typeof SELECTABLE_TYPES)[number])
      ? defaultGameType
      : 'LOTTO649',
  );
  const meta = getMetaByType(gameType);
  const [numbers, setNumbers] = useState<number[]>([]);
  const [specialNum, setSpecialNum] = useState<number | null>(null);
  const [label, setLabel] = useState<string>('');
  const [error, setError] = useState<string>('');

  // 切換彩種時重置號碼
  useEffect(() => {
    setNumbers([]);
    setSpecialNum(null);
    setError('');
  }, [gameType]);

  if (!meta) return null;

  const minNum = gameType === 'LOTTO3D' || gameType === 'LOTTO4D' ? 0 : 1;
  const maxNum = meta.ballRange.main[1];
  const mainCount = meta.ballRange.mainCount;
  const allowDuplicate = gameType === 'LOTTO3D' || gameType === 'LOTTO4D';
  const hasSpecial = !!meta.ballRange.special;
  const specialMax = meta.ballRange.special?.[1] ?? 0;

  const toggleNumber = (n: number) => {
    setError('');
    if (allowDuplicate) {
      // 3 / 4 星彩：用順序選號（按位置填數字）
      if (numbers.length < mainCount) {
        setNumbers([...numbers, n]);
      }
      return;
    }
    if (numbers.includes(n)) {
      setNumbers(numbers.filter((x) => x !== n));
    } else if (numbers.length < mainCount) {
      setNumbers([...numbers, n].sort((a, b) => a - b));
    } else {
      setError(`最多只能選 ${mainCount} 個號碼`);
    }
  };

  const toggleSpecial = (n: number) => {
    setError('');
    setSpecialNum(specialNum === n ? null : n);
  };

  const reset = () => {
    setNumbers([]);
    setSpecialNum(null);
    setError('');
  };

  const mutation = useMutation({
    mutationFn: (payload: { gameType: string; label: string; numbers: number[]; specialNum?: number[] }) =>
      apiFetch<{ data: unknown }>('/lottery/my-picks', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
    onError: (e: Error) => setError(e.message ?? '儲存失敗'),
  });

  const canSubmit = numbers.length === mainCount && (!hasSpecial || specialNum != null) && label.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) {
      setError('請完成所有必填欄位');
      return;
    }
    mutation.mutate({
      gameType,
      label: label.trim(),
      numbers,
      specialNum: hasSpecial && specialNum != null ? [specialNum] : undefined,
    });
  };

  // 號碼盤
  const numberPool = useMemo(() => {
    const arr: number[] = [];
    for (let i = minNum; i <= maxNum; i++) arr.push(i);
    return arr;
  }, [minNum, maxNum]);

  const specialPool = useMemo(() => {
    if (!hasSpecial) return [];
    const arr: number[] = [];
    for (let i = 1; i <= specialMax; i++) arr.push(i);
    return arr;
  }, [hasSpecial, specialMax]);

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/60 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-xl border border-amber-300 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-5 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className="text-lg">⭐</span>
            <span className="font-bold">新增號碼組</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-lg">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 1. 選彩種 */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2 tracking-wider">① 選擇彩種</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {SELECTABLE_TYPES.map((t) => {
                const m = getMetaByType(t)!;
                const active = t === gameType;
                return (
                  <button
                    key={t}
                    onClick={() => setGameType(t)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                      active
                        ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200'
                        : 'bg-white border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    <GameIcon meta={m} size={32} />
                    <span className={`text-xs ${active ? 'font-bold text-amber-700' : 'text-gray-700'}`}>
                      {m.shortName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. 號碼選盤 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-gray-700 tracking-wider">
                ② 選 {mainCount} 個{allowDuplicate ? '位數' : '號碼'}（{numbers.length}/{mainCount}）
              </label>
              <button onClick={reset} className="text-[10px] text-gray-500 hover:text-amber-600">
                清除全部
              </button>
            </div>

            {allowDuplicate ? (
              // 3D / 4D：順序填入
              <>
                <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-50/60 border border-amber-200 rounded-lg">
                  <span className="text-[10px] text-amber-700">已選順序：</span>
                  {numbers.length === 0 ? (
                    <span className="text-[10px] text-gray-400">尚未選擇</span>
                  ) : (
                    numbers.map((n, idx) => (
                      <span key={idx} className="flex items-center gap-1">
                        <LotteryBall number={n} size="sm" />
                        {idx < numbers.length - 1 && <span className="text-gray-300">→</span>}
                      </span>
                    ))
                  )}
                </div>
                <div className="grid grid-cols-10 gap-1.5">
                  {numberPool.map((n) => (
                    <button
                      key={n}
                      onClick={() => toggleNumber(n)}
                      disabled={numbers.length >= mainCount}
                      className="flex items-center justify-center disabled:opacity-30 hover:scale-110 transition-transform"
                    >
                      <LotteryBall number={n} size="md" />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-7 sm:grid-cols-10 gap-1.5">
                {numberPool.map((n) => {
                  const selected = numbers.includes(n);
                  return (
                    <button
                      key={n}
                      onClick={() => toggleNumber(n)}
                      className={`flex items-center justify-center p-1 rounded-full transition-all ${
                        selected ? 'ring-2 ring-amber-500 bg-amber-100/40' : 'hover:scale-110'
                      }`}
                    >
                      <LotteryBall number={n} size="md" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. 特別號 */}
          {hasSpecial && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2 tracking-wider">
                ③ 選 1 個特別號（{specialNum != null ? '已選' : '未選'}）
              </label>
              <div className="grid grid-cols-7 sm:grid-cols-10 gap-1.5">
                {specialPool.map((n) => {
                  const selected = specialNum === n;
                  return (
                    <button
                      key={n}
                      onClick={() => toggleSpecial(n)}
                      className={`flex items-center justify-center p-1 rounded-full transition-all ${
                        selected ? 'ring-2 ring-red-500 bg-red-100/40' : 'hover:scale-110'
                      }`}
                    >
                      <LotteryBall number={n} size="md" isSpecial />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. 命名 */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-2 tracking-wider">
              {hasSpecial ? '④' : '③'} 為這組號碼命名
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例：我的固定組合 / 老婆生日組"
              maxLength={30}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
            />
            <div className="text-[10px] text-gray-400 mt-1 text-right">{label.length}/30</div>
          </div>

          {/* 錯誤訊息 */}
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              {error}
            </div>
          )}

          {/* 操作按鈕 */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || mutation.isPending}
              className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? '儲存中...' : '✓ 儲存號碼組'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
