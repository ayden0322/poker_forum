import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '隱私權政策',
  description: '博客邦隱私權政策 — 說明本網站如何收集、使用、保護您的個人資料，包含 Google、Facebook、LINE 第三方登入服務的資料使用方式。',
  robots: { index: true, follow: true },
};

const updatedAt = '2026-04-09';

export default function PrivacyPage() {
  return (
    <article className="bg-white rounded-lg shadow-sm p-6 sm:p-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">隱私權政策</h1>
      <p className="text-sm text-gray-500 mb-8">最後更新日期：{updatedAt}</p>

      <div className="prose prose-sm sm:prose-base max-w-none text-gray-700 space-y-6">
        <section>
          <p>
            歡迎您使用「博客邦」（以下簡稱「本網站」）。本網站非常重視會員的隱私權，
            為了讓您能夠安心使用本網站的各項服務與資訊，特此說明本網站的隱私權保護政策，
            以保障您的權益，請您詳閱下列內容：
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">一、適用範圍</h2>
          <p>
            本隱私權政策適用於您在本網站活動時所涉及的個人資料蒐集、運用與保護，
            但不適用於本網站以外的相關連結網站。凡經由本網站連結之其他網站，
            各網站均有其專屬的隱私權政策，本網站不負任何連帶責任。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">二、個人資料的蒐集與使用</h2>
          <p>本網站於下列情況會請您提供個人資料：</p>
          <ul className="list-disc pl-6 space-y-2 mt-3">
            <li>
              <strong>會員註冊：</strong>暱稱、帳號、電子郵件地址、密碼。
            </li>
            <li>
              <strong>第三方登入：</strong>當您使用 Google、Facebook 或 LINE
              登入時，本網站會向該服務提供者取得您的基本資料（暱稱、頭像、電子郵件地址）。
            </li>
            <li>
              <strong>使用紀錄：</strong>您於本網站發表的文章、回覆、推文、收藏，
              以及登入時的 IP 位址、瀏覽器類型、訪問時間。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">三、第三方登入服務說明</h2>
          <p>
            為提供您更便利的會員服務，本網站整合了下列第三方登入服務。
            使用第三方登入時，本網站會向該服務提供者請求以下資料：
          </p>

          <div className="mt-4 space-y-4">
            <div className="border-l-4 border-blue-500 pl-4 py-1">
              <h3 className="font-semibold text-gray-900">Google 登入</h3>
              <p className="text-sm mt-1">
                取得您的 Google 帳號基本資料（姓名、頭像、電子郵件地址）。
                這些資料將用於建立您在本網站的會員帳號、顯示個人資訊、
                以及未來透過電子郵件聯繫您（如密碼重設、重要通知）。
              </p>
            </div>

            <div className="border-l-4 border-blue-700 pl-4 py-1">
              <h3 className="font-semibold text-gray-900">Facebook 登入</h3>
              <p className="text-sm mt-1">
                取得您的 Facebook 帳號基本資料（姓名、頭像、電子郵件地址）。
                這些資料將用於建立您在本網站的會員帳號、顯示個人資訊、
                以及未來透過電子郵件聯繫您。本網站不會在 Facebook 上代您發布任何內容。
              </p>
            </div>

            <div className="border-l-4 border-green-600 pl-4 py-1">
              <h3 className="font-semibold text-gray-900">LINE 登入</h3>
              <p className="text-sm mt-1">
                取得您的 LINE 帳號基本資料（顯示名稱、頭像、電子郵件地址）。
                <strong>電子郵件地址的用途</strong>包含：
                作為會員身份識別、密碼重設時的聯絡管道、以及網站重要訊息通知。
                本網站不會將您的 email 提供給任何第三方。
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            您可隨時於 Google、Facebook、LINE 各平台的應用程式管理介面，
            撤銷對本網站的授權。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">四、個人資料的使用目的</h2>
          <p>本網站蒐集您的個人資料，將用於以下目的：</p>
          <ul className="list-disc pl-6 space-y-1 mt-3">
            <li>提供會員註冊、登入、身份識別服務</li>
            <li>提供文章發表、回覆、推文、收藏等社群功能</li>
            <li>密碼重設、帳號異常通知、重要訊息推播</li>
            <li>違規行為追蹤與處理（含 IP 紀錄）</li>
            <li>網站功能改善與使用統計分析</li>
            <li>依法配合主管機關或司法機關之要求</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">五、資料保護</h2>
          <p>
            本網站採用加密技術（HTTPS）保護您的資料傳輸，
            並使用業界標準的密碼雜湊演算法（bcrypt）儲存您的密碼。
            本網站員工及合作夥伴僅得在必要範圍內接觸您的個人資料，
            並與本網站簽訂保密合約，違反者將受法律制裁。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">六、Cookie 政策</h2>
          <p>
            本網站使用 Cookie 與類似技術以維持登入狀態、記錄使用偏好。
            您可透過瀏覽器設定拒絕 Cookie，但可能導致部分功能無法正常運作。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">七、您的權利</h2>
          <p>依據《個人資料保護法》第三條，您對於個人資料享有下列權利：</p>
          <ul className="list-disc pl-6 space-y-1 mt-3">
            <li>查詢或請求閱覽個人資料</li>
            <li>請求製給複製本</li>
            <li>請求補充或更正個人資料</li>
            <li>請求停止蒐集、處理或利用</li>
            <li>請求刪除個人資料</li>
          </ul>
          <p className="mt-3">
            如您欲行使上述權利，可至「
            <a href="/data-deletion" className="text-blue-600 hover:underline">
              資料刪除說明
            </a>
            」頁面查看，或透過下方聯絡方式與我們聯繫。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">八、未成年人保護</h2>
          <p>
            本網站涉及彩券與運動賽事討論內容，
            <strong>未滿 18 歲者請勿註冊使用本網站</strong>。
            若家長或監護人發現未成年人擅自註冊，可聯繫本網站要求刪除帳號。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">九、政策修訂</h2>
          <p>
            本網站保留隨時修訂本隱私權政策的權利。修訂後的政策將公布於本頁面，
            並於發布日起生效。建議您定期查閱本政策以瞭解最新內容。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">十、聯絡我們</h2>
          <p>如您對本隱私權政策有任何疑問，歡迎透過下列方式與我們聯繫：</p>
          <ul className="list-none pl-0 space-y-1 mt-3">
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
