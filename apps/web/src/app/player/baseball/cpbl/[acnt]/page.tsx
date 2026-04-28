import CpblPlayerPageClient from './CpblPlayerPageClient';

export default async function CpblPlayerPage({
  params,
}: {
  params: Promise<{ acnt: string }>;
}) {
  const { acnt } = await params;
  return <CpblPlayerPageClient acnt={acnt} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ acnt: string }>;
}) {
  const { acnt } = await params;
  return {
    title: `中華職棒球員 - ${acnt}`,
    description: `中華職棒 CPBL 球員個人資料、賽季統計、生涯統計`,
  };
}
