'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth';
import { useMemberSummary, useDailyTasks, levelName } from '@/lib/member';
import ExperienceBar from '@/components/member/ExperienceBar';
import DailyTaskList from '@/components/member/DailyTaskList';
import CosmeticsPanel from '@/components/member/CosmeticsPanel';

/**
 * 會員中心：等級 / 經驗、G幣（P幣即將開放）、今日每日任務。
 * fail-closed：總開關關閉（enabled:false）直接導回首頁，不露任何會員 UI（Codex #8）。
 */
export default function MemberCenterPage() {
  const { user, isLoading: authLoading, requireLogin } = useAuth();
  const router = useRouter();
  const summaryQ = useMemberSummary();
  const tasksQ = useDailyTasks();

  const m = summaryQ.data?.data;
  const t = tasksQ.data?.data;

  // 未登入 → 彈登入 Modal
  useEffect(() => {
    if (!authLoading && !user) requireLogin();
  }, [authLoading, user, requireLogin]);

  // 開關關閉 → 導回首頁
  useEffect(() => {
    if (m && m.enabled === false) router.replace('/');
  }, [m, router]);

  if (authLoading || !user) {
    return <div className="mx-auto max-w-2xl p-6 text-center text-gray-400">請先登入…</div>;
  }
  if (summaryQ.isLoading) {
    return <div className="mx-auto max-w-2xl p-6 text-center text-gray-400">載入中…</div>;
  }
  // 開關關閉：上面的 effect 會導回首頁，導航期間 render null 不閃「尚未開放」文字（Codex Phase2 #2）
  if (!m?.enabled) {
    return null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <h1 className="text-xl font-bold text-gray-900">會員中心</h1>

      {/* 等級 / 經驗 */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-gray-900">{user.nickname}</div>
            <div className="text-sm text-gray-500">
              Lv.{m.level} {m.levelName ?? levelName(m.level)}
            </div>
          </div>
          <div className="rounded-full bg-[#39B8BE]/10 px-3 py-1 text-sm font-bold text-[#2a8d92]">
            Lv.{m.level}
          </div>
        </div>
        <div className="mt-4">
          <ExperienceBar m={m} />
        </div>
      </section>

      {/* 錢包 */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-400">G幣</div>
            <div className="text-2xl font-bold text-amber-500">{m.g ?? 0}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">P幣（預測幣）</div>
            <div className="text-2xl font-bold text-gray-300">{m.p ?? 0}</div>
            <div className="text-[11px] text-gray-400">即將開放</div>
          </div>
        </div>
      </section>

      {/* 每日任務 */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-gray-900">每日任務</h2>
        {tasksQ.isLoading ? (
          <div className="text-sm text-gray-400">載入任務中…</div>
        ) : t?.enabled ? (
          <DailyTaskList data={t} />
        ) : (
          <div className="text-sm text-gray-400">目前沒有可顯示的任務</div>
        )}
      </section>

      {/* 裝飾商店 + 我的裝飾 + 勳章牆 */}
      <CosmeticsPanel />
    </div>
  );
}
