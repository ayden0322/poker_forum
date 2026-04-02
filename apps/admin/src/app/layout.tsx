import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { AdminLayout } from '@/components/AdminLayout';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: '博客邦 - 管理後台',
  description: '博客邦管理後台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body>
        <AntdRegistry>
          <Providers>
            <AdminLayout>{children}</AdminLayout>
          </Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
