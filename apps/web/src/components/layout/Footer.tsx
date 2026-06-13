import Link from 'next/link';

/** API-Sports 公開 media CDN（免金鑰）聯賽 logo */
const media = (sport: 'football' | 'basketball' | 'baseball', id: number) =>
  `https://media.api-sports.io/${sport}/leagues/${id}.png`;

/**
 * 合作賽事 logo 牆 — 分層襯底法（設計顧問拍板）
 * 因 footer 為深色底，依 logo 視覺型態分兩組處理（皆已實測填充密度分類）：
 * - line：線條/盾徽型（有內部負空間）→ 透明單色白剪影，hover 點亮原色
 * - badge：實心徽章型（NBA/MLB/義甲… 單色化會變色塊）→ 半透明淺色 tile 保留原色，
 *   tile 用 bg-white/10 在深底上呈現「提亮深灰塊」而非白塊
 * 兩組分排不交錯，視覺讀成兩個有意的 group。
 */
const LINE_LEAGUES: { name: string; logo: string }[] = [
  { name: '世界盃', logo: media('football', 1) },
  { name: '英超', logo: media('football', 39) },
  { name: '西甲', logo: media('football', 140) },
  { name: '歐冠', logo: media('football', 2) },
  { name: '歐霸', logo: media('football', 3) },
  { name: '法甲', logo: media('football', 61) },
  { name: '荷甲', logo: media('football', 88) },
  { name: '西籃甲', logo: media('basketball', 117) },
  { name: '土耳其籃', logo: media('basketball', 104) },
  { name: '立陶宛籃', logo: media('basketball', 60) },
  { name: '日職', logo: media('baseball', 2) },
  { name: '韓職', logo: media('baseball', 5) },
];

const BADGE_LEAGUES: { name: string; logo: string }[] = [
  { name: 'NBA', logo: media('basketball', 12) },
  { name: 'MLB', logo: media('baseball', 1) },
  { name: '義甲', logo: media('football', 135) },
  { name: '德甲', logo: media('football', 78) },
  { name: 'J 聯賽', logo: media('football', 98) },
  { name: '英冠', logo: media('football', 40) },
];

export function Footer() {
  return (
    <footer className="bg-gray-800 text-gray-400 mt-auto">
      {/* 合作賽事 logo 牆 */}
      <div className="border-b border-gray-700/60">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className="h-px w-8 bg-primary-500/60" />
            <h3 className="text-sm font-bold tracking-[0.2em] text-gray-200">競技賽事</h3>
            <span className="h-px w-8 bg-primary-500/60" />
          </div>

          {/* 線條型：透明單色白剪影 */}
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-x-8 gap-y-6 mb-6">
            {LINE_LEAGUES.map((l) => (
              <div
                key={l.name}
                className="group flex items-center justify-center py-2 hover:-translate-y-0.5 transition-transform duration-200"
                title={l.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={l.logo}
                  alt={l.name}
                  loading="lazy"
                  className="h-8 w-auto max-w-[72px] object-contain grayscale brightness-0 invert opacity-50 transition-all duration-200 group-hover:grayscale-0 group-hover:brightness-100 group-hover:invert-0 group-hover:opacity-100"
                />
              </div>
            ))}
          </div>

          {/* 實心徽章型：半透明淺色 tile 保留原色 */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {BADGE_LEAGUES.map((l) => (
              <div
                key={l.name}
                className="group flex items-center justify-center rounded-lg bg-white/10 p-2.5 hover:bg-white/[0.16] hover:scale-105 transition-all duration-200"
                title={l.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={l.logo}
                  alt={l.name}
                  loading="lazy"
                  className="h-7 w-auto max-w-[64px] object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 版權列 */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm">&copy; 2026 博客邦. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm justify-center">
            <Link href="/about" className="hover:text-white transition-colors">關於我們</Link>
            <Link href="/terms" className="hover:text-white transition-colors">服務條款</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">隱私政策</Link>
            <Link href="/data-deletion" className="hover:text-white transition-colors">資料刪除</Link>
            <Link href="/contact" className="hover:text-white transition-colors">聯絡我們</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
