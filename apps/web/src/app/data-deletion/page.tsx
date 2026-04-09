import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '資料刪除說明',
  description: '博客邦資料刪除說明 — 如何刪除您在本網站的個人資料，包含 Facebook、Google、LINE 第三方登入資料的處理方式。',
  robots: { index: true, follow: true },
};

const updatedAt = '2026-04-09';

export default function DataDeletionPage() {
  return (
    <article className="bg-white rounded-lg shadow-sm p-6 sm:p-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">資料刪除說明</h1>
      <p className="text-sm text-gray-500 mb-8">最後更新日期：{updatedAt}</p>

      <div className="prose prose-sm sm:prose-base max-w-none text-gray-700 space-y-6">
        <section>
          <p>
            「博客邦」（以下簡稱「本網站」）尊重您對個人資料的控制權。
            依據《個人資料保護法》及 Facebook、Google、LINE
            等第三方平台的開發者政策，您有權隨時要求刪除您在本網站的所有個人資料。
            本頁面說明如何提出刪除請求以及處理流程。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">一、可刪除的資料範圍</h2>
          <p>當您提出刪除請求後，本網站將刪除以下資料：</p>
          <ul className="list-disc pl-6 space-y-2 mt-3">
            <li>會員基本資料（暱稱、帳號、電子郵件、頭像）</li>
            <li>第三方登入綁定資料（Google、Facebook、LINE 之 providerId）</li>
            <li>密碼雜湊值與密碼重設紀錄</li>
            <li>登入紀錄與 IP 位址</li>
            <li>個人通知、收藏、追蹤關係</li>
            <li>您發表的文章、回覆、推文（依下方第三條另行說明）</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">二、如何提出刪除請求</h2>
          <p>請選擇下列任一方式聯繫本網站，並提供您的「會員暱稱」或「註冊 Email」：</p>

          <div className="mt-4 space-y-3">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-1">方式一：透過 Email 申請</h3>
              <p className="text-sm">
                寄信至{' '}
                <a href="mailto:service@goboka.net" className="text-blue-600 hover:underline">
                  service@goboka.net
                </a>
                ，主旨請填寫「會員資料刪除申請」，
                內文註明您的會員暱稱或註冊 Email。
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-1">方式二：透過會員後台申請</h3>
              <p className="text-sm">
                登入本網站後，至「會員設定」頁面點擊「刪除帳號」按鈕，
                依指示完成驗證。
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">三、文章與回覆的處理</h2>
          <p>
            您於本網站發表的文章、回覆、推文等內容，由於可能涉及其他使用者的討論脈絡，
            刪除帳號時將採以下處理：
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-3">
            <li>
              <strong>個人識別資訊將被清除：</strong>
              發文者名稱會顯示為「已刪除使用者」，無法追溯回您本人。
            </li>
            <li>
              <strong>內容主體保留：</strong>
              文章與回覆內容保留於本網站，以維持討論串完整性。
            </li>
            <li>
              <strong>如需完整刪除：</strong>
              請於申請刪除帳號時，特別註明「請一併刪除我發表的所有內容」，
              本網站將盡力配合處理。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">四、處理時程</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>本網站將於收到您的請求後 <strong>7 個工作天內</strong>處理完畢。</li>
            <li>處理完成後將以 Email 通知您。</li>
            <li>
              部分資料（如登入日誌、IP 紀錄）依法可能需保留一段時間以供查驗，
              但僅限於必要範圍。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">五、第三方平台授權撤銷</h2>
          <p>
            刪除本網站帳號後，建議您也至第三方平台撤銷對本網站的授權：
          </p>

          <div className="mt-4 space-y-3">
            <div className="border-l-4 border-blue-500 pl-4 py-1">
              <h3 className="font-semibold text-gray-900">Google</h3>
              <p className="text-sm mt-1">
                前往{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Google 帳戶 → 第三方應用程式
                </a>
                ，找到「博客邦」並點選「移除存取權」。
              </p>
            </div>

            <div className="border-l-4 border-blue-700 pl-4 py-1">
              <h3 className="font-semibold text-gray-900">Facebook</h3>
              <p className="text-sm mt-1">
                前往 Facebook → 設定與隱私 → 設定 →「應用程式和網站」，
                找到「博客邦」並點選「移除」。
              </p>
            </div>

            <div className="border-l-4 border-green-600 pl-4 py-1">
              <h3 className="font-semibold text-gray-900">LINE</h3>
              <p className="text-sm mt-1">
                開啟 LINE App → 主頁 → 設定 → 我的帳號 →「已連動的應用程式」，
                找到「博客邦」並點選「解除連動」。
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">六、注意事項</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>刪除為不可逆操作：</strong>
              一旦資料被刪除，將無法復原，請審慎評估。
            </li>
            <li>
              <strong>無法重複使用相同帳號：</strong>
              為防止濫用，已刪除的帳號名稱可能無法再次註冊。
            </li>
            <li>
              <strong>未結算事項：</strong>
              如您有未處理的檢舉、申訴或其他事項，建議處理完畢後再申請刪除。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">七、聯絡資訊</h2>
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
              <strong>聯絡信箱：</strong>
              <a href="mailto:service@goboka.net" className="text-blue-600 hover:underline">
                service@goboka.net
              </a>
            </li>
          </ul>
        </section>
      </div>
    </article>
  );
}
