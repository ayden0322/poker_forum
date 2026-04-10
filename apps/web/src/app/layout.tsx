import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Providers } from './providers';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: {
    default: '博客邦 - 體育賽事與台灣彩票討論社群',
    template: '%s | 博客邦',
  },
  description: '台灣最大的體育賽事與台灣彩票討論社群，涵蓋 MLB、NBA、足球賽事分析，大樂透、威力彩、今彩539 開獎討論與選號技巧分享。',
  keywords: ['博客邦', '體育討論', '台灣彩票', 'MLB', 'NBA', '大樂透', '威力彩', '今彩539', '運彩'],
  openGraph: {
    title: '博客邦 - 體育賽事與台灣彩票討論社群',
    description: '台灣最大的體育賽事與台灣彩票討論社群，涵蓋體育賽事分析與台灣彩票開獎討論。',
    type: 'website',
    locale: 'zh_TW',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
        <Providers>
          <Header />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
