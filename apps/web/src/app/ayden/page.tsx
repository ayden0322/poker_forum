import type { Metadata } from 'next';

// 隱藏頁：Ayden 私人榮譽系統規劃存查處。不進 sitemap、noindex、robots 已 disallow /ayden。
export const metadata: Metadata = {
  title: 'Ayden · 榮譽系統規劃',
  robots: { index: false, follow: false },
};

interface Doc {
  href: string;
  title: string;
  desc: string;
  tag: string;
  tagColor: string;
}

const DOCS: Doc[] = [
  {
    href: '/ayden/honor-rules.html',
    title: '榮譽系統 · 規則定案 v1',
    desc: '賽季三層／三榜口徑／月末加冕次月在位／防刷紅線／門檻表／買不到 vs 可買。六項規則討論定案。',
    tag: '定案',
    tagColor: 'bg-teal-100 text-teal-700',
  },
  {
    href: '/ayden/honor-full.html',
    title: '榮譽系統 · 完整規劃',
    desc: '賽季競逐排行榜／加冕時刻／我的榮耀儀表板／名人堂傳奇牆／榮耀圖鑑成就總表／冠軍限定裝飾。',
    tag: '完整 mock',
    tagColor: 'bg-amber-100 text-amber-700',
  },
  {
    href: '/ayden/integrated-card.html',
    title: '完整戰績身份卡（榮耀＋門面整合）',
    desc: '門面層(可買框/稱號)＋榮耀層(加冕徽記/金光暈/戰績/勳章/名人堂)疊成一張卡，貼文 feed 三種榮耀階級＋兩層拆解。',
    tag: '成品 mock',
    tagColor: 'bg-amber-100 text-amber-700',
  },
  {
    href: '/ayden/honor-impl-spec.html',
    title: '榮譽系統 · 落地實作 spec v1',
    desc: '資料模型(Prisma)＋P幣競猜戰績接點：現有可複用、新增模型、接點、分期落地、防刷落點、Prod 注意。',
    tag: '實作 spec',
    tagColor: 'bg-teal-100 text-teal-700',
  },
  {
    href: '/ayden/badge-complete.html',
    title: '榮耀徽章總表（定案·13 枚）',
    desc: '霧面鑄章家族：冠軍/連勝/命中/準度/帶單/資歷，金屬色分稀有度。已寫進 seed assetUrl，戰績卡渲染真徽章。',
    tag: '美術定案',
    tagColor: 'bg-amber-100 text-amber-700',
  },
  {
    href: '/ayden/glory-mock.html',
    title: '榮譽感 · 概念',
    desc: '榮耀＝稀缺 × 戰績解鎖(買不到) × 被看見 × 加冕與傳承；冠軍卡 vs 一般卡的差距。',
    tag: '概念',
    tagColor: 'bg-amber-100 text-amber-700',
  },
  {
    href: '/ayden/recordcard-mock.html',
    title: '戰績身份卡 · 發文頁',
    desc: '每則貼文/回覆的作者欄＝一張戰績身份卡（頭銜＋勝率/連勝/獲利榜＋flair＋勳章）。',
    tag: 'mock',
    tagColor: 'bg-slate-100 text-slate-600',
  },
  {
    href: '/ayden/forum-research.html',
    title: '各大論壇「作者欄」研究',
    desc: '六類論壇 postbit 運用對照 → 收斂出角色定位的 4 個槓桿 → 博客邦戰績身份卡藍圖。',
    tag: '研究依據',
    tagColor: 'bg-slate-100 text-slate-600',
  },
  {
    href: '/ayden/medal-r3-board.html',
    title: '勳章視覺 · 方向探索',
    desc: '琺瑯胸章／刺繡布章／燙箔卡／低多邊形／riso／霓虹 6 案（供參考，視覺尚未定案）。',
    tag: '探索中',
    tagColor: 'bg-slate-100 text-slate-500',
  },
];

export default function AydenPlanningHub() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-widest text-teal-600">內部規劃存查 · 未公開</div>
        <h1 className="mt-1 text-2xl font-extrabold text-gray-900">博客邦 榮譽系統 · 規劃彙整</h1>
        <p className="mt-2 text-sm text-gray-500">
          榮譽系統的設計討論、規則定案與各版 mock 都收在這，方便日後回顧。此頁未連在導覽列、已 noindex。
        </p>
      </div>

      <div className="mb-5 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
        <div className="text-xs font-bold text-teal-700 mb-2">✦ 已上線（測試站，一期後端＋前端）</div>
        <div className="flex flex-wrap gap-2 text-sm">
          <a href="/honor" className="rounded-lg bg-white border border-teal-200 px-3 py-1.5 font-semibold text-teal-700 hover:bg-teal-50">榮譽頁 /honor（排行＋名人堂）↗</a>
          <a href="/user/%E7%8D%B2%E5%88%A9%E7%8E%8B_1783567733946" className="rounded-lg bg-white border border-teal-200 px-3 py-1.5 font-semibold text-teal-700 hover:bg-teal-50">冠軍戰績身份卡（範例）↗</a>
        </div>
        <p className="mt-2 text-[12px] text-gray-500">後端：Season/成就/名人堂/冠軍加冕 已實作＋E2E 驗證（分支 feat/honor-system）。二期：影響力/跟單。</p>
      </div>

      <div className="space-y-3">
        {DOCS.map((d) => (
          <a
            key={d.href}
            href={d.href}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50/30"
          >
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-900">{d.title}</h2>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${d.tagColor}`}>{d.tag}</span>
              <span className="ml-auto text-sm text-gray-300">↗</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">{d.desc}</p>
          </a>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-gray-200 p-4 text-[13px] text-gray-500">
        <b className="text-gray-700">目前進度</b>：規則六項已定案（見「規則定案 v1」）。接下來可做——① 榮耀實際視覺（冠軍限定框/加冕光暈/名人堂實體）②
        把榮耀層整合進戰績身份卡 ③ 落地實作（資料模型 + P幣競猜戰績接點）。
      </div>
    </div>
  );
}
