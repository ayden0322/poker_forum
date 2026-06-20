'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth';

/**
 * 等級名稱（對齊後端 LevelTier：Lv1~Lv5）。
 * 注意：舊系統曾用「新手/初學者/進階/老手/高手/大師」6 級（發文數驅動），
 * 已改為經驗驅動 5 級。未知等級（如舊資料 level=6）以 levelName() fallback。
 */
export const LEVEL_NAMES = ['', '新手', '球探', '分析師', '專家', '名人堂'] as const;

/** 安全取等級名稱；超出範圍（舊資料）回 '會員'，與後端 getSummary 一致。 */
export function levelName(level: number | null | undefined): string {
  if (level == null) return '會員';
  return LEVEL_NAMES[level] ?? '會員';
}

export interface MemberSummary {
  enabled: boolean;
  g?: number;
  p?: number;
  exp?: number;
  level?: number;
  levelName?: string;
  nextLevel?: { level: number; name: string; minExp: number } | null;
  expIntoCurrent?: number;
  expForNext?: number | null;
  progressPct?: number | null;
}

export interface DailyTaskStatus {
  taskKey: string;
  label: string;
  rewardG: number;
  rewardExp: number;
  threshold: number;
  progress: number;
  done: boolean;
}

export interface DailyTasksToday {
  enabled: boolean;
  tasks: DailyTaskStatus[];
  grantedG?: number;
  grantedExp?: number;
  capG?: number;
  capExp?: number;
}

/**
 * 我的會員經濟總覽。
 * - queryKey 綁 user.id：避免帳號切換後看到上一個人的快取（Codex #9）。
 * - 不傳 token 給 apiFetch：讓它走 localStorage + 401 自動 refresh（Codex #10）。
 * - refetchOnWindowFocus：賺幣後切回視窗會更新（Codex #11）。
 */
export function useMemberSummary() {
  const { user, accessToken } = useAuth();
  return useQuery<{ data: MemberSummary }>({
    queryKey: ['member', 'me', user?.id],
    queryFn: () => apiFetch<{ data: MemberSummary }>('/member/me'),
    enabled: !!accessToken && !!user?.id,
    refetchOnWindowFocus: true,
  });
}

/** 我的今日每日任務狀態（同上快取/refresh 策略）。 */
export function useDailyTasks() {
  const { user, accessToken } = useAuth();
  return useQuery<{ data: DailyTasksToday }>({
    queryKey: ['member', 'tasks', 'today', user?.id],
    queryFn: () => apiFetch<{ data: DailyTasksToday }>('/member/tasks/today'),
    enabled: !!accessToken && !!user?.id,
    refetchOnWindowFocus: true,
  });
}
