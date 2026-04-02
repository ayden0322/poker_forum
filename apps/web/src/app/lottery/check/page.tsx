'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { LotteryBall } from '@/components/lottery/LotteryBall';

const GAME_OPTIONS = [
  { value: 'LOTTO649', label: '大樂透', count: 6, max: 49, min: 1, hasSpecial: true, specialLabel: '特別號' },
  { value: 'SUPER_LOTTO', label: '威力彩', count: 6, max: 38, min: 1, hasSpecial: true, specialLabel: '第二區' },
  { value: 'DAILY539', label: '今彩539', count: 5, max: 39, min: 1, hasSpecial: false, specialLabel: '' },
  { value: 'LOTTO1224', label: '雙贏彩', count: 12, max: 24, min: 1, hasSpecial: false, specialLabel: '' },
  { value: 'LOTTO3D', label: '3星彩', count: 3, max: 9, min: 0, hasSpecial: false, specialLabel: '' },
  { value: 'LOTTO4D', label: '4星彩', count: 4, max: 9, min: 0, hasSpecial: false, specialLabel: '' },
];

interface CheckResult {
  matched: boolean;
  message: string;
  drawResult?: {
    gameName: string;
    period: string;
    drawDate: string;
    numbers: number[];
    specialNum: number[] | null;
  };
  userNumbers?: number[];
  matchedNumbers?: number[];
  matchCount?: number;
  specialMatched?: boolean;
  prize?: string | null;
}

interface CheckResponse {
  data: CheckResult;
}

export default function LotteryCheckPage() {
  const [gameType, setGameType] = useState('LOTTO649');
  const [numbers, setNumbers] = useState<string[]>(Array(6).fill(''));
  const [specialNum, setSpecialNum] = useState('');

  const gameConfig = GAME_OPTIONS.find((g) => g.value === gameType)!;

  const checkMutation = useMutation({
    mutationFn: (body: { gameType: string; numbers: number[]; specialNum?: number }) =>
      apiFetch<CheckResponse>('/lottery/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
  });

  const handleGameChange = (value: string) => {
    setGameType(value);
    const config = GAME_OPTIONS.find((g) => g.value === value)!;
    setNumbers(Array(config.count).fill(''));
    setSpecialNum('');
    checkMutation.reset();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nums = numbers.map((n) => parseInt(n));
    const validNums = nums.filter((n) => !isNaN(n) && n >= gameConfig.min && n <= gameConfig.max);
    if (validNums.length !== gameConfig.count) {
      alert(`請輸入 ${gameConfig.count} 個 ${gameConfig.min}~${gameConfig.max} 的號碼`);
      return;
    }

    const body: { gameType: string; numbers: number[]; specialNum?: number } = {
      gameType,
      numbers: validNums,
    };

    if (gameConfig.hasSpecial && specialNum) {
      body.specialNum = parseInt(specialNum);
    }

    checkMutation.mutate(body);
  };

  const result = checkMutation.data?.data;

  return (
    <div className="max-w-2xl mx-auto">
      {/* 麵包屑 */}
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">線上對獎</span>
      </nav>

      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        🎯 線上對獎
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 彩種選擇 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">選擇彩種</label>
          <div className="flex flex-wrap gap-2">
            {GAME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleGameChange(opt.value)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  gameType === opt.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 號碼輸入 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            輸入你的號碼（{gameConfig.count} 個，{gameConfig.min}~{gameConfig.max}）
          </label>
          <div className="flex flex-wrap gap-2">
            {numbers.map((num, i) => (
              <input
                key={i}
                type="number"
                min={gameConfig.min}
                max={gameConfig.max}
                value={num}
                onChange={(e) => {
                  const newNums = [...numbers];
                  newNums[i] = e.target.value;
                  setNumbers(newNums);
                }}
                placeholder={String(i + 1)}
                className="w-14 h-12 text-center border border-gray-300 rounded-lg text-lg font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            ))}
          </div>
        </div>

        {/* 特別號 */}
        {gameConfig.hasSpecial && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {gameConfig.specialLabel}（選填）
            </label>
            <input
              type="number"
              min={1}
              max={gameType === 'SUPER_LOTTO' ? 8 : gameConfig.max}
              value={specialNum}
              onChange={(e) => setSpecialNum(e.target.value)}
              placeholder="特別號"
              className="w-14 h-12 text-center border-2 border-red-300 rounded-lg text-lg font-bold focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
          </div>
        )}

        {/* 對獎按鈕 */}
        <button
          type="submit"
          disabled={checkMutation.isPending}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {checkMutation.isPending ? '對獎中...' : '🎯 立即對獎'}
        </button>
      </form>

      {/* 結果區域 */}
      {result && (
        <div className={`mt-8 rounded-xl border-2 p-6 ${
          result.matched
            ? 'border-yellow-400 bg-yellow-50'
            : 'border-gray-200 bg-gray-50'
        }`}>
          {/* 中獎/未中獎標題 */}
          <div className="text-center mb-4">
            {result.matched ? (
              <div>
                <div className="text-4xl mb-2">🎉</div>
                <h2 className="text-2xl font-bold text-yellow-600">{result.message}</h2>
                <p className="text-lg text-yellow-500 font-semibold mt-1">{result.prize}</p>
              </div>
            ) : (
              <div>
                <div className="text-4xl mb-2">😢</div>
                <h2 className="text-xl font-bold text-gray-600">{result.message}</h2>
              </div>
            )}
          </div>

          {/* 開獎號碼比對 */}
          {result.drawResult && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                {result.drawResult.gameName} 第 {result.drawResult.period} 期開獎號碼：
              </h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {result.drawResult.numbers.map((num, i) => (
                  <div key={i} className="relative">
                    <LotteryBall number={num} size="lg" />
                    {result.matchedNumbers?.includes(num) && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">✓</span>
                    )}
                  </div>
                ))}
                {result.drawResult.specialNum?.map((num, i) => (
                  <div key={`s-${i}`} className="relative">
                    <LotteryBall number={num} size="lg" isSpecial />
                    {result.specialMatched && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">✓</span>
                    )}
                  </div>
                ))}
              </div>

              {/* 你的號碼 */}
              <h3 className="text-sm font-medium text-gray-500 mb-2">你的號碼：</h3>
              <div className="flex flex-wrap gap-2">
                {result.userNumbers?.map((num, i) => {
                  const isMatch = result.matchedNumbers?.includes(num);
                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center justify-center w-11 h-11 rounded-full font-bold text-base ${
                        isMatch
                          ? 'bg-green-500 text-white ring-2 ring-green-300'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {String(num).padStart(2, '0')}
                    </span>
                  );
                })}
              </div>

              <p className="mt-3 text-sm text-gray-500">
                命中 {result.matchCount ?? 0} 個號碼
                {result.specialMatched ? '，特別號命中' : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
