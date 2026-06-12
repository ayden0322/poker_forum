import Link from 'next/link';

/** API-Sports 公開 media CDN（免金鑰）聯賽 logo */
const media = (sport: 'football' | 'basketball' | 'baseball', id: number) =>
  `https://media.api-sports.io/${sport}/leagues/${id}.png`;

/** 合作賽事 logo 牆（涵蓋站台收錄的足球/籃球/棒球聯賽；logo 皆已驗證可用） */
const PARTNER_LEAGUES: { name: string; logo: string }[] = [
  // 足球
  { name: '世界盃', logo: media('football', 1) },
  { name: '英超', logo: media('football', 39) },
  { name: '西甲', logo: media('football', 140) },
  { name: '義甲', logo: media('football', 135) },
  { name: '德甲', logo: media('football', 78) },
  { name: '法甲', logo: media('football', 61) },
  { name: '葡超', logo: media('football', 94) },
  { name: '荷甲', logo: media('football', 88) },
  { name: 'J 聯賽', logo: media('football', 98) },
  { name: '英冠', logo: media('football', 40) },
  { name: '美職聯', logo: media('football', 253) },
  { name: '巴甲', logo: media('football', 71) },
  // 籃球
  { name: 'NBA', logo: media('basketball', 12) },
  { name: '西籃甲', logo: media('basketball', 117) },
  { name: '義籃', logo: media('basketball', 52) },
  { name: '德籃', logo: media('basketball', 40) },
  { name: '法籃', logo: media('basketball', 2) },
  { name: '希臘籃', logo: media('basketball', 45) },
  { name: '立陶宛籃', logo: media('basketball', 60) },
  { name: '日籃 B1', logo: media('basketball', 56) },
  // 棒球
  { name: 'MLB', logo: media('baseball', 1) },
  { name: '中職', logo: media('baseball', 3) },
  { name: '日職', logo: media('baseball', 2) },
  { name: '韓職', logo: media('baseball', 5) },
];

export function Footer() {
  return (
    <footer className="bg-gray-800 text-gray-400 mt-auto">
      {/* 合作賽事 logo 牆 */}
      <div className="border-b border-gray-700/60">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center gap-3 mb-5">
            <span className="h-px w-8 bg-primary-500/60" />
            <h3 className="text-sm font-bold tracking-[0.2em] text-gray-200">合作賽事</h3>
            <span className="h-px w-8 bg-primary-500/60" />
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {PARTNER_LEAGUES.map((l) => (
              <div
                key={l.name}
                className="flex items-center gap-1.5 bg-white/95 rounded-md px-2 py-1.5 hover:bg-white transition-colors"
                title={l.name}
              >
                {/* 外部聯賽 logo 數量多，用原生 img + lazy，避免 next/image 大量優化請求 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={l.logo}
                  alt={l.name}
                  loading="lazy"
                  className="h-5 w-5 object-contain flex-shrink-0"
                />
                <span className="text-[11px] text-gray-700 truncate">{l.name}</span>
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
