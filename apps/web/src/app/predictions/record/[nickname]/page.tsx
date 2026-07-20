import type { Metadata } from 'next';
import RecordClient from './RecordClient';

export async function generateMetadata({ params }: { params: { nickname: string } }): Promise<Metadata> {
  const nickname = decodeURIComponent(params.nickname);
  return {
    title: `${nickname} 的競猜戰績｜博客邦`,
    description: `${nickname} 在博客邦的賽事競猜戰績——勝率、平均賠率與近期預測紀錄。`,
    openGraph: {
      title: `${nickname} 的競猜戰績`,
      description: '賽前預測、賽後見真章——博客邦賽事競猜',
    },
  };
}

export default function RecordPage({ params }: { params: { nickname: string } }) {
  return <RecordClient nickname={decodeURIComponent(params.nickname)} />;
}
