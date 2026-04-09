import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '關於我們',
  description: '博客邦 — 台灣最大的體育賽事與台灣彩票討論社群。',
  robots: { index: true, follow: true },
};

export default function AboutPage() {
  return (
    <article className="bg-white rounded-lg shadow-sm p-6 sm:p-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">關於博客邦</h1>
      <p className="text-sm text-gray-500 mb-8">台灣最大的體育賽事與台灣彩票討論社群</p>

      <div className="space-y-6 text-gray-700">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">我們的理念</h2>
          <p>
            博客邦致力於打造一個專業、自由、友善的體育與彩票討論空間。
            我們相信，每一位喜愛體育賽事與彩券分析的朋友，
            都應該有一個能夠盡情交流、分享心得的平台。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">服務內容</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>體育賽事討論：</strong>
              涵蓋 MLB、NBA、足球、棒球等熱門運動賽事分析與情報交流
            </li>
            <li>
              <strong>台灣彩券資訊：</strong>
              即時開獎速報、號碼統計分析、選號技巧分享
            </li>
            <li>
              <strong>會員社群：</strong>
              文章發表、回覆討論、推文互動、追蹤收藏
            </li>
            <li>
              <strong>多元登入：</strong>
              支援帳號密碼、Google、Facebook、LINE 多種登入方式
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">社群守則</h2>
          <p>
            為了維護良好的討論環境，我們希望所有會員能夠：
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-3">
            <li>尊重不同意見，理性討論</li>
            <li>不發表攻擊性、歧視性、違法之內容</li>
            <li>不進行任何形式的廣告、洗版、灌水行為</li>
            <li>遵守
              <a href="/terms" className="text-blue-600 hover:underline mx-1">服務條款</a>
              與
              <a href="/privacy" className="text-blue-600 hover:underline mx-1">隱私權政策</a>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">未成年人警語</h2>
          <p className="bg-yellow-50 border-l-4 border-yellow-400 p-4 text-sm">
            ⚠️ 本網站涉及彩券與運動賽事討論內容，<strong>未滿 18 歲者請勿註冊使用</strong>。
            本網站不提供任何形式之線上博弈、簽注或金流交易服務。
            若您或您身邊的人有賭博成癮問題，請尋求專業協助。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">聯繫我們</h2>
          <p>
            如有任何建議、合作或問題，歡迎透過
            <a href="/contact" className="text-blue-600 hover:underline mx-1">聯絡我們</a>
            頁面與我們聯繫。
          </p>
        </section>
      </div>
    </article>
  );
}
