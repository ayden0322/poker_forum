'use client';

import type { DailyTasksToday } from '@/lib/member';

/** 今日每日任務清單：每項顯示進度條、獎勵、完成狀態，底部顯示每日上限進度。 */
export default function DailyTaskList({ data }: { data: DailyTasksToday }) {
  return (
    <div className="space-y-3">
      {data.tasks.map((t) => {
        const pct = t.done ? 100 : t.threshold > 0 ? Math.round((t.progress / t.threshold) * 100) : 0;
        return (
          <div key={t.taskKey} className="rounded-lg border border-gray-100 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">{t.label}</span>
              {t.done ? (
                <span className="text-xs font-semibold text-[#2a8d92]">已完成</span>
              ) : (
                <span className="text-xs text-gray-400">
                  {t.progress}/{t.threshold}
                </span>
              )}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-[#39B8BE] transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1.5 text-xs text-gray-500">
              獎勵 +{t.rewardG} G幣 · +{t.rewardExp} 經驗
            </div>
          </div>
        );
      })}
      {data.capG != null && (
        <div className="pt-1 text-xs text-gray-400">
          今日已獲得 {data.grantedG}/{data.capG} G幣（每日上限）
        </div>
      )}
    </div>
  );
}
