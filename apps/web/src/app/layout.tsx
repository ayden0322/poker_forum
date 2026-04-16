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
    default: '博客邦 - 亞洲最大賽事論壇',
    template: '%s | 博客邦',
  },
  description: '亞洲最大賽事論壇，涵蓋 MLB、NBA、足球賽事分析，大樂透、威力彩、今彩539 開獎討論與選號技巧分享。',
  keywords: ['博客邦', '體育討論', '台灣彩票', 'MLB', 'NBA', '大樂透', '威力彩', '今彩539', '運彩'],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: '博客邦 - 亞洲最大賽事論壇',
    description: '亞洲最大賽事論壇，涵蓋體育賽事分析與台灣彩票開獎討論。',
    type: 'website',
    locale: 'zh_TW',
    images: [{ url: '/logo.png', width: 800, height: 400, alt: '博客邦 GOBOKA' }],
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
