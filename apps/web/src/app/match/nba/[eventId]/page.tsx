import NBAMatchPageClient from './NBAMatchPageClient';

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return {
    title: `NBA 比賽 ${eventId}`,
    description: `NBA 比賽即時比分、Box Score、Play-by-play`,
  };
}

export default async function NBAMatchPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <NBAMatchPageClient eventId={eventId} />;
}
