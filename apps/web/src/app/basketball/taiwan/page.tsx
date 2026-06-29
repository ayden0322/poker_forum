import { apiFetch } from '@/lib/api';
import Link from 'next/link';

/**
 * 台灣職籃總覽 hub 頁 — 吃「台灣職籃有幾隊/幾個聯盟」通用搜尋字，內鏈分流到各聯賽板塊。
 * Hub-and-spoke：本頁吃高量通用字，再把權重/流量導到 P.League+ / TPBL / SBL 板塊。
 */

interface NStanding {
  rank: number;
  team: { id: number; name: string; nameZhTw?: string | null; logo: string };
  wins: number;
  losses: number;
}

const TW_LEAGUES = [
  { slug: 'tpbl', name: 'TPBL 台灣職籃大聯盟', desc: '2024 年由 P.LEAGUE+ 與 T1 聯盟部分球隊整併成立，目前台灣場次最多的男子職業籃球聯賽。', accent: 'from-red-50' },
  { slug: 'p-league-plus', name: 'P.League+', desc: '2020 年成立的台灣職業籃球聯盟，數據完整、含賠率資訊。', accent: 'from-blue-50' },
  { slug: 'sbl', name: 'SBL 超級籃球聯賽', desc: '台灣歷史最悠久的半職業籃球聯賽，2003 年創立。', accent: 'from-amber-50' },
];

async function fetchStandings(slug: string): Promise<NStanding[]> {
  try {
    const res = await apiFetch<{ data: NStanding[] }>(`/basketball/${slug}/standings`);
    return res.data ?? [];
  } catch {
    return [];
  }
}

export const metadata = {
  title: '台灣職籃總覽 — TPBL、P.League+、SBL 有幾隊？聯盟差異一次看懂',
  description:
    '台灣目前有哪些職業籃球聯盟？TPBL、P.League+、SBL 差在哪、各有幾支球隊、最新戰績排名一次整理，附即時數據與討論區。',
  alternates: { canonical: '/basketball/taiwan' },
};

export default async function TaiwanBasketballHubPage() {
  const standings = await Promise.all(TW_LEAGUES.map((l) => fetchStandings(l.slug)));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '台灣職籃總覽 — TPBL、P.League+、SBL 聯盟差異與球隊',
    about: TW_LEAGUES.map((l) => ({ '@type': 'SportsOrganization', name: l.name })),
  };

  const totalTeams = standings.reduce((sum, s) => sum + s.length, 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-xs text-gray-400 mb-3 flex items-center gap-1">
        <Link href="/" className="hover:text-gray-600">首頁</Link>
        <span>›</span>
        <span className="text-gray-500">台灣職籃總覽</span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">台灣職籃總覽：TPBL、P.League+、SBL</h1>
      <p className="text-sm text-gray-600 leading-relaxed mb-5">
        台灣目前主要有 <b>三個</b> 籃球聯賽在運作：<b>TPBL（台灣職籃大聯盟）</b>、<b>P.League+</b> 與歷史最悠久的{' '}
        <b>SBL（超級籃球聯賽）</b>。其中 TPBL 是 2024 年整併後場次最多的男子職業聯賽。以下整理三個聯盟的差異、球隊數與最新戰績
        {totalTeams > 0 && <>（目前共收錄 <b>{totalTeams}</b> 支球隊即時資料）</>}。
      </p>

      <div className="space-y-5">
        {TW_LEAGUES.map((lg, i) => {
          const rows = standings[i];
          return (
            <section key={lg.slug} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className={`px-4 py-3 bg-gradient-to-r ${lg.accent} to-white border-b border-gray-100`}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold text-gray-800">{lg.name}</h2>
                  <Link href={`/board/${lg.slug}`} className="text-xs text-orange-600 hover:underline flex-shrink-0">
                    進討論區 / 完整數據 →
                  </Link>
                </div>
                <p className="text-xs text-gray-500 mt-1">{lg.desc}</p>
              </div>

              {rows.length === 0 ? (
                <div className="px-4 py-4 text-xs text-gray-400">
                  本季尚未開打或資料更新中 —{' '}
                  <Link href={`/board/${lg.slug}`} className="text-orange-600 hover:underline">前往 {lg.name} 板塊</Link>
                </div>
              ) : (
                <>
                  <div className="px-4 py-1.5 text-xs text-gray-400 border-b border-gray-50">
                    共 {rows.length} 支球隊 · 戰績排名
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {rows.slice(0, 6).map((s) => (
                        <tr key={s.team.id} className="border-b border-gray-50">
                          <td className="px-3 py-2 text-gray-400 w-8">{s.rank}</td>
                          <td className="px-2 py-2">
                            <Link href={`/team/basketball/${lg.slug}/${s.team.id}`} className="flex items-center gap-2 hover:text-orange-600">
                              {s.team.logo && (
                                <img src={s.team.logo} alt="" className="w-5 h-5 object-contain" />
                              )}
                              <span className="text-gray-800">{s.team.nameZhTw ?? s.team.name}</span>
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums text-gray-600">{s.wins}勝{s.losses}敗</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 6 && (
                    <div className="px-4 py-2 text-center">
                      <Link href={`/board/${lg.slug}`} className="text-xs text-orange-600 hover:underline">
                        看完整 {rows.length} 隊排名 →
                      </Link>
                    </div>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-6 bg-gray-50 rounded-xl p-4 text-sm text-gray-600 leading-relaxed">
        <h2 className="font-bold text-gray-800 mb-2">常見問題</h2>
        <p className="mb-2"><b>Q：台灣職籃有幾個聯盟？</b><br />目前有 TPBL、P.League+、SBL 三個聯賽運作，其中 TPBL 為 2024 年整併後的最大男子職業聯賽。</p>
        <p><b>Q：TPBL 和 P.League+ 差在哪？</b><br />P.League+ 為 2020 年成立的職業聯盟；TPBL 則於 2024 年整併部分球隊另立，兩者目前並行。各聯盟球隊與戰績可點上方板塊查看即時資料。</p>
      </div>
    </div>
  );
}
