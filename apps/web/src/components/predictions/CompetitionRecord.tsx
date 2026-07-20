'use client';

// 競猜戰績（共用元件）— 公開戰績頁 /predictions/record 與個人主頁「競猜紀錄」tab 共用。
// 視角分流（隱私鐵律，兩處自動一致）：
//   - 本人：完整金額明細（投入/拿回/淨損益/退回）
//   - 訪客：只有立場與命中（曬預測不曬錢）
// embedded=true：個人主頁 tab 用，省略麵包屑與大標題（外層已有身份卡）。

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth';
import { apiFetch } from '@/lib/api';
import {
  BET_STATUS_VIEW,
  matchInfoUrl,
  MyBet,
  RecordBet,
  SELECTION_LABEL,
  twTime,
  useMyBets,
  usePublicRecord,
} from '@/lib/predictions';
import TeamLabel from '@/components/predictions/TeamLabel';

function selText(b: { market: string; selection: string; line: number | null }): string {
  return b.market === 'OVER_UNDER' ? `${SELECTION_LABEL[b.selection]} ${b.line}` : SELECTION_LABEL[b.selection];
}

/** 跟這單：跟隨他人公開的進行中預測單並實下同方向注（二期·影響力） */
function FollowButton({ betId }: { betId: string }) {
  const [open, setOpen] = useState(false);
  const [stake, setStake] = useState(100);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => apiFetch(`/predictions/picks/${betId}/follow`, { method: 'POST', body: JSON.stringify({ stake }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prediction'] });
      qc.invalidateQueries({ queryKey: ['user'] });
    },
  });

  if (mut.isSuccess) return <span className="shrink-0 text-xs font-medium text-[#2a8d92]">已跟單 ✓</span>;
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg bg-[#0d9488] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f766e]"
      >
        跟這單
      </button>
    );
  }
  return (
    <div className="shrink-0 flex items-center gap-1.5">
      <input
        type="number"
        min={1}
        value={stake}
        onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 0))}
        className="w-16 rounded-md border border-gray-200 px-2 py-1 text-xs tabular-nums"
      />
      <span className="text-xs text-gray-400">P</span>
      <button
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        className="rounded-md bg-[#0d9488] px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
      >
        {mut.isPending ? '…' : '確認'}
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">取消</button>
      {mut.isError && <span className="text-[11px] text-red-500">跟單失敗</span>}
    </div>
  );
}

/** 訪客版注單卡（無金額）。canFollow：登入且非本人時，進行中單可跟。 */
function PublicBetCard({ b, canFollow }: { b: RecordBet; canFollow?: boolean }) {
  const sv = BET_STATUS_VIEW[b.status];
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm flex items-center justify-between gap-3">
      <div className="min-w-0">
        <Link href={matchInfoUrl(b)} className="block text-sm font-medium text-gray-900 truncate hover:text-[#2a8d92]">
          <TeamLabel nameEn={b.home} /> <span className="text-xs text-gray-300 mx-0.5">vs</span> <TeamLabel nameEn={b.away} />
        </Link>
        <div className="mt-0.5 text-xs text-gray-500">
          {selText(b)} <span className="font-mono-stadium tabular-nums">@{b.lockedOdds}</span> · {twTime(b.startTime)}
          <Link href={matchInfoUrl(b)} className="ml-2 text-[#2a8d92] hover:underline">賽事資訊 →</Link>
        </div>
      </div>
      {b.status === 'PENDING' && canFollow ? (
        <FollowButton betId={b.id} />
      ) : (
        <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${sv.className}`}>{sv.label}</span>
      )}
    </div>
  );
}

/** 本人版注單卡（含投入/拿回明細） */
function OwnerBetCard({ b }: { b: MyBet }) {
  const sv = BET_STATUS_VIEW[b.status];
  const money =
    b.status === 'PENDING' ? (
      <>投入 <b className="font-mono-stadium tabular-nums text-gray-700">{b.stake}</b> P · 命中可拿回{' '}
        <b className="font-mono-stadium tabular-nums text-gray-700">{b.potentialPayout}</b> P</>
    ) : b.status === 'WON' ? (
      <>投入 <b className="font-mono-stadium tabular-nums">{b.stake}</b> P → 拿回{' '}
        <b className="font-mono-stadium tabular-nums text-[#2a8d92]">{b.potentialPayout}</b> P
        <span className="text-[#2a8d92]">（淨 +{b.potentialPayout - b.stake}）</span></>
    ) : b.status === 'LOST' ? (
      <>投入 <b className="font-mono-stadium tabular-nums">{b.stake}</b> P · 未命中</>
    ) : (
      <>本金 <b className="font-mono-stadium tabular-nums">{b.stake}</b> P 已退回</>
    );

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm flex items-center justify-between gap-3">
      <div className="min-w-0">
        <Link href={matchInfoUrl(b)} className="block text-sm font-medium text-gray-900 truncate hover:text-[#2a8d92]">
          <TeamLabel nameEn={b.home} /> <span className="text-xs text-gray-300 mx-0.5">vs</span> <TeamLabel nameEn={b.away} />
        </Link>
        <div className="mt-0.5 text-xs text-gray-500">
          {selText(b)} <span className="font-mono-stadium tabular-nums">@{b.lockedOdds}</span> · {twTime(b.startTime)}
          <Link href={matchInfoUrl(b)} className="ml-2 text-[#2a8d92] hover:underline">賽事資訊 →</Link>
        </div>
        <div className="mt-1 text-xs text-gray-500">{money}</div>
      </div>
      <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${sv.className}`}>{sv.label}</span>
    </div>
  );
}

export default function CompetitionRecord({ nickname, embedded = false }: { nickname: string; embedded?: boolean }) {
  const { user } = useAuth();
  const isOwner = user?.nickname === nickname;
  const { data, isLoading } = usePublicRecord(nickname);
  const { data: mineData } = useMyBets(); // 未登入時 hook 自動不打
  const rec = data?.data;

  if (isLoading) return <div className="text-center text-sm text-gray-400 py-16">載入中…</div>;
  if (!rec?.enabled) return null; // 競猜關閉：fail-closed
  if (!rec.found) {
    return <div className="text-center text-sm text-gray-400 py-16">找不到這位會員</div>;
  }

  const stats = rec.stats!;
  const mine = isOwner && mineData?.data.enabled ? mineData.data.bets : null;
  const ownPending = mine?.filter((b) => b.status === 'PENDING') ?? [];
  const ownSettled = mine?.filter((b) => b.status !== 'PENDING') ?? [];

  return (
    <div className={embedded ? '' : 'max-w-2xl mx-auto'}>
      {!embedded && (
        <>
          <div className="text-sm text-gray-400">
            <Link href="/predictions" className="hover:text-[#2a8d92]">賽事競猜</Link> / 戰績
          </div>
          <h1 className="mt-1 text-xl font-bold text-gray-900">
            {rec.nickname} 的競猜戰績
            {isOwner && <span className="ml-2 align-middle text-xs font-normal text-gray-400">（只有你看得到金額明細）</span>}
          </h1>
        </>
      )}
      {embedded && isOwner && (
        <p className="text-xs text-gray-400">（只有你看得到金額明細）</p>
      )}

      {/* 三元組（透明本身是防禦：勝率永遠跟平均賠率、注數一起出現） */}
      <div className={`grid grid-cols-3 gap-3 ${embedded ? 'mt-2' : 'mt-4'}`}>
        {[
          { label: '勝率', value: stats.n > 0 ? `${stats.winRate}%` : '—' },
          { label: '平均賠率', value: stats.n > 0 ? `@${stats.avgOdds}` : '—' },
          { label: '有效注數', value: stats.n },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm">
            <div className="text-xs text-gray-400">{s.label}</div>
            <div className="mt-1 text-xl font-bold font-mono-stadium tabular-nums text-gray-900">{s.value}</div>
          </div>
        ))}
      </div>

      {mine ? (
        /* ===== 本人視角：完整明細 ===== */
        <>
          {ownPending.length > 0 && (
            <>
              <h2 className="mt-6 text-base font-bold text-gray-900">進行中</h2>
              <div className="mt-2 space-y-2">
                {ownPending.map((b) => <OwnerBetCard key={b.betId} b={b} />)}
              </div>
            </>
          )}
          <h2 className="mt-6 text-base font-bold text-gray-900">近期競猜</h2>
          <div className="mt-2 space-y-2">
            {ownSettled.length === 0 ? (
              <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
                還沒有已結算的競猜
              </div>
            ) : (
              ownSettled.map((b) => <OwnerBetCard key={b.betId} b={b} />)
            )}
          </div>
        </>
      ) : (
        /* ===== 訪客視角：立場與命中，不含金額 ===== */
        <>
          {(rec.pending ?? []).length > 0 && (
            <>
              <h2 className="mt-6 text-base font-bold text-gray-900">進行中</h2>
              <div className="mt-2 space-y-2">
                {rec.pending!.map((b, i) => <PublicBetCard key={`p-${i}`} b={b} canFollow={!!user && !isOwner} />)}
              </div>
            </>
          )}
          <h2 className="mt-6 text-base font-bold text-gray-900">近期競猜</h2>
          <div className="mt-2 space-y-2">
            {(rec.recent ?? []).length === 0 ? (
              <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
                還沒有已結算的競猜
              </div>
            ) : (
              rec.recent!.map((b, i) => <PublicBetCard key={i} b={b} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
