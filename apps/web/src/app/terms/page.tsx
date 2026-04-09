import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '服務條款',
  description: '博客邦服務條款 — 使用本網站服務前，請詳閱本條款。',
  robots: { index: true, follow: true },
};

const updatedAt = '2026-04-09';

export default function TermsPage() {
  return (
    <article className="bg-white rounded-lg shadow-sm p-6 sm:p-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">服務條款</h1>
      <p className="text-sm text-gray-500 mb-8">最後更新日期：{updatedAt}</p>

      <div className="prose prose-sm sm:prose-base max-w-none text-gray-700 space-y-6">
        <section>
          <p>
            歡迎使用「博客邦」（以下簡稱「本網站」）。本服務條款（以下簡稱「本條款」）
            為您與本網站之間的法律協議。當您註冊、登入或使用本網站任何服務時，
            即表示您已閱讀、理解並同意接受本條款全部內容之拘束。
            若您不同意本條款，請立即停止使用本網站。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">一、服務內容</h2>
          <p>
            本網站提供體育賽事討論、台灣彩券開獎資訊、會員社群互動等服務，
            包含但不限於：文章發表、回覆、推文、收藏、追蹤、私訊等功能。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">二、會員資格</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>年齡限制：</strong>本網站涉及彩券與運動賽事討論內容，
              使用者必須年滿 18 歲方可註冊。
            </li>
            <li>
              <strong>真實資料：</strong>註冊時請提供真實、正確、最新之資料，
              並維持其準確性。
            </li>
            <li>
              <strong>帳號安全：</strong>您應妥善保管帳號與密碼，
              因您個人疏失導致帳號被盜用，本網站不負任何責任。
            </li>
            <li>
              <strong>單一帳號：</strong>每位使用者原則上僅能註冊一個帳號。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">三、使用者行為規範</h2>
          <p>使用本網站時，您不得從事下列任何行為：</p>
          <ol className="list-decimal pl-6 space-y-1 mt-3">
            <li>違反任何中華民國法律或國際條約</li>
            <li>從事任何形式的線上博弈、金流交易、期約簽賭等違法行為</li>
            <li>發表色情、暴力、仇恨、歧視、騷擾、威脅、毀謗他人之內容</li>
            <li>侵害他人智慧財產權、隱私權、肖像權或其他權利</li>
            <li>散布病毒、惡意程式或進行任何破壞網站運作之行為</li>
            <li>使用爬蟲、自動化工具大量擷取本網站內容</li>
            <li>冒用他人身份或偽造資訊</li>
            <li>發布廣告、垃圾訊息、洗版、洗評論</li>
            <li>其他經本網站認定不適當之行為</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">四、彩券資訊聲明</h2>
          <p>
            本網站提供之台灣彩券開獎資訊僅供參考，
            <strong>正確資訊以台灣彩券股份有限公司公告為準</strong>。
            本網站不提供任何形式之簽注、購買、兌獎服務，
            亦不對使用者依本網站資訊所為之任何投資或購買行為負責。
          </p>
          <p className="mt-3">
            <strong>本網站不鼓勵任何形式的賭博行為。</strong>
            若您或您身邊的人有賭博成癮問題，建議尋求專業協助。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">五、智慧財產權</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              本網站之網站介面、Logo、程式碼、設計等著作權，
              均歸本網站或其授權人所有。
            </li>
            <li>
              使用者於本網站發表之文章、回覆等內容，著作權歸使用者本人所有；
              但您同意授權本網站於本網站範圍內，
              無償、永久、非專屬地使用、重製、修改、公開傳輸該等內容。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">六、內容管理</h2>
          <p>
            本網站有權但無義務對使用者發表之內容進行審查。
            如發現違反本條款之內容，本網站得不經通知逕行刪除、隱藏，
            並視情節輕重對該帳號採取警告、停權、永久封鎖等處置。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">七、服務變更與中止</h2>
          <p>
            本網站保留隨時修改、暫停或終止全部或部分服務的權利，
            無須事先通知使用者，亦不對使用者或任何第三方負責。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">八、免責聲明</h2>
          <p>
            本網站依「現況」提供服務，不擔保服務之穩定性、安全性、即時性、正確性與完整性。
            因不可抗力（含但不限於系統維護、天災、戰爭、駭客攻擊）導致之服務中斷，
            本網站不負任何責任。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">九、條款修訂</h2>
          <p>
            本網站保留隨時修訂本條款的權利。修訂後的條款將公布於本頁面，
            並於發布日起生效。您於修訂後繼續使用本網站，
            即視為同意接受修訂後的條款。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">十、準據法與管轄法院</h2>
          <p>
            本條款之解釋與適用，以及與本條款有關之爭議，
            均依中華民國法律處理，
            並以臺灣臺北地方法院為第一審管轄法院。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">十一、聯絡資訊</h2>
          <ul className="list-none pl-0 space-y-1">
            <li>
              <strong>網站名稱：</strong>博客邦
            </li>
            <li>
              <strong>網址：</strong>
              <a href="https://www.goboka.net" className="text-blue-600 hover:underline">
                https://www.goboka.net
              </a>
            </li>
            <li>
              <strong>聯絡信箱：</strong>service@goboka.net
            </li>
          </ul>
        </section>
      </div>
    </article>
  );
}
