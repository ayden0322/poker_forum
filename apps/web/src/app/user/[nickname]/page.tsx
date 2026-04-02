import { Metadata } from 'next';
import { UserProfileClient } from './UserProfileClient';

interface Props {
  params: { nickname: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: `${decodeURIComponent(params.nickname)} 的個人頁面 - 博客邦`,
  };
}

export default function UserProfilePage({ params }: Props) {
  return <UserProfileClient nickname={decodeURIComponent(params.nickname)} />;
}
