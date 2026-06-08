import { apiFetch } from '@/lib/api';
import { HomeBaseballHub } from '@/components/home/HomeBaseballHub';
import { TodayUpcomingStrip } from '@/components/home/TodayUpcomingStrip';
import { SITE_URL } from '@/lib/site';

interface MarqueeItem {
  id: string;
  content: string;
  url: string | null;
}

export const revalidate = 60;

export default async function HomePage() {
  let marquees: MarqueeItem[] = [];
  try {
    const marqRes = await apiFetch<{ data: MarqueeItem[] }>('/boards/marquees');
    marquees = marqRes.data;
  } catch {
    // API 可能尚未啟動
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '博客邦',
    description: '亞洲最大賽事論壇 - 博客邦',
    url: SITE_URL,
  };

  return (
    <div className="max-w-6xl mx-auto">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* 今日即將開打：header 下方全棒球聯盟橫向快覽帶 */}
      <TodayUpcomingStrip />

      <div className="mb-4 flex items-baseline gap-2">
        <h1 className="text-xl font-bold text-gray-900">博客邦</h1>
        <span className="text-sm text-gray-500">亞洲最大賽事論壇 · 棒球即時賽事 × 玩家討論</span>
      </div>

      {marquees.length > 0 && (
        <div className="mb-5 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2.5 overflow-hidden">
          <div className="flex items-center gap-3 animate-marquee">
            <span className="text-yellow-600 font-medium shrink-0">📢 最新</span>
            <div className="flex items-center gap-6 text-sm text-yellow-800">
              {marquees.map((m) =>
                m.url ? (
                  <a key={m.id} href={m.url} className="hover:underline shrink-0">{m.content}</a>
                ) : (
                  <span key={m.id} className="shrink-0">{m.content}</span>
                ),
              )}
            </div>
          </div>
        </div>
      )}

      {/* 棒球賽事中心：多聯盟三狀態即時賽事 + 新聞/討論/數據（看板與體育賽事走 header 導覽） */}
      <HomeBaseballHub />
    </div>
  );
}
