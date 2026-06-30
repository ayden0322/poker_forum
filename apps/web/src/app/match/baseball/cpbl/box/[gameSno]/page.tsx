import CpblBoxPageClient from './CpblBoxPageClient';

export default async function CpblBoxScorePage({
  params,
}: {
  params: Promise<{ gameSno: string }>;
}) {
  const { gameSno } = await params;
  return <CpblBoxPageClient gameSno={Number(gameSno)} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameSno: string }>;
}) {
  const { gameSno } = await params;
  return {
    title: `中華職棒 Box Score #${gameSno}`,
    description: `中華職棒 CPBL 比賽戰報、逐局比分、打擊投球統計`,
    alternates: { canonical: `/match/baseball/cpbl/box/${gameSno}` },
  };
}
