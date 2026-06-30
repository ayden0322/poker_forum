import { Metadata } from 'next';
import { UserProfileClient } from './UserProfileClient';

interface Props {
  params: { nickname: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: `${decodeURIComponent(params.nickname)} 的個人頁面`,
    alternates: { canonical: `/user/${params.nickname}` },
    // 個人頁為 CSR 空殼薄內容，且大量帳號頁會稀釋整站品質、吃 crawl budget → 不收錄但允許爬連結
    robots: { index: false, follow: true },
  };
}

export default function UserProfilePage({ params }: Props) {
  return <UserProfileClient nickname={decodeURIComponent(params.nickname)} />;
}
