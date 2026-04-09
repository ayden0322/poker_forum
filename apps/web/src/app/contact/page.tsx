import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '聯絡我們',
  description: '博客邦聯絡方式 — 如有任何問題或建議，歡迎與我們聯繫。',
  robots: { index: true, follow: true },
};

export default function ContactPage() {
  return (
    <article className="bg-white rounded-lg shadow-sm p-6 sm:p-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">聯絡我們</h1>
      <p className="text-sm text-gray-500 mb-8">如有任何問題或建議，歡迎與我們聯繫</p>

      <div className="space-y-6 text-gray-700">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">聯絡管道</h2>
          <div className="bg-gray-50 rounded-lg p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">📧 客服信箱</h3>
              <a
                href="mailto:service@goboka.net"
                className="text-blue-600 hover:underline text-lg"
              >
                service@goboka.net
              </a>
              <p className="text-sm text-gray-500 mt-1">
                適用於：會員問題、檢舉申訴、合作洽詢、資料刪除申請
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">常見問題</h2>
          <div className="space-y-3">
            <details className="bg-gray-50 rounded-lg p-4 group">
              <summary className="font-semibold cursor-pointer text-gray-900">
                忘記密碼怎麼辦？
              </summary>
              <p className="mt-3 text-sm">
                請至{' '}
                <a href="/forgot-password" className="text-blue-600 hover:underline">
                  忘記密碼
                </a>{' '}
                頁面，輸入您註冊的 Email，系統將寄送密碼重設連結給您。
              </p>
            </details>

            <details className="bg-gray-50 rounded-lg p-4 group">
              <summary className="font-semibold cursor-pointer text-gray-900">
                如何刪除我的帳號？
              </summary>
              <p className="mt-3 text-sm">
                請參考{' '}
                <a href="/data-deletion" className="text-blue-600 hover:underline">
                  資料刪除說明
                </a>
                {' '}頁面，或直接寄信至 service@goboka.net 申請。
              </p>
            </details>

            <details className="bg-gray-50 rounded-lg p-4 group">
              <summary className="font-semibold cursor-pointer text-gray-900">
                可以同時用多種方式登入同一個帳號嗎？
              </summary>
              <p className="mt-3 text-sm">
                可以。當您使用 Google、Facebook、LINE 登入時，
                若該服務提供者回傳的 email 與您既有帳號相同，系統會自動將該登入方式綁定至您的帳號。
              </p>
            </details>

            <details className="bg-gray-50 rounded-lg p-4 group">
              <summary className="font-semibold cursor-pointer text-gray-900">
                檢舉違規內容
              </summary>
              <p className="mt-3 text-sm">
                您可在每篇文章/回覆右側點擊「檢舉」按鈕，
                或寄信至 service@goboka.net 並附上違規內容連結。
              </p>
            </details>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">回應時間</h2>
          <p>
            我們會盡快回覆您的訊息，一般情況下將於
            <strong className="mx-1">3 個工作天內</strong>
            回覆。重要事項（如資料刪除申請）將於
            <strong className="mx-1">7 個工作天內</strong>
            處理完畢。
          </p>
        </section>
      </div>
    </article>
  );
}
