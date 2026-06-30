import { apiFetch } from '@/lib/api';
import { notFound } from 'next/navigation';
import BasketballTeamClient, { TeamOverview } from './BasketballTeamClient';

async function fetchOverview(league: string, teamId: number): Promise<TeamOverview | null> {
  try {
    const res = await apiFetch<{ data: TeamOverview }>(`/basketball/${league}/teams/${teamId}/overview`);
    return res.data ?? null;
  } catch {
    return null;
  }
}

async function fetchLeagueName(league: string): Promise<string> {
  try {
    const res = await apiFetch<{ data: { displayName: string } }>(`/basketball/${league}/config`);
    return res.data?.displayName ?? league.toUpperCase();
  } catch {
    return league.toUpperCase();
  }
}

function teamLabel(ov: TeamOverview, teamId: number): string {
  const fromTeam = ov.team?.nameZhTw ?? ov.team?.name;
  if (fromTeam) return fromTeam;
  const row = ov.standings?.find((s) => s.team.id === teamId);
  return row?.team.nameZhTw ?? row?.team.name ?? `#${teamId}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ league: string; teamId: string }>;
}) {
  const { league, teamId } = await params;
  const [ov, leagueName] = await Promise.all([fetchOverview(league, Number(teamId)), fetchLeagueName(league)]);
  if (!ov) return { title: `${leagueName} 球隊資訊`, alternates: { canonical: `/team/basketball/${league}/${teamId}` } };
  const name = teamLabel(ov, Number(teamId));
  return {
    title: `${name} - ${leagueName}球隊資訊、戰績與近期賽程`,
    description: `${leagueName} ${name} 的最新戰績、聯盟排名、近期比賽結果與賽程。`,
    alternates: { canonical: `/team/basketball/${league}/${teamId}` },
  };
}

export default async function BasketballTeamPage({
  params,
}: {
  params: Promise<{ league: string; teamId: string }>;
}) {
  const { league, teamId } = await params;
  const id = Number(teamId);
  const [ov, leagueName] = await Promise.all([fetchOverview(league, id), fetchLeagueName(league)]);
  if (!ov) notFound();

  const name = teamLabel(ov, id);
  const row = ov.standings?.find((s) => s.team.id === id);
  const logo = ov.team?.logo ?? row?.team.logo ?? '';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name,
    sport: 'Basketball',
    image: logo || undefined,
    memberOf: { '@type': 'SportsOrganization', name: leagueName },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BasketballTeamClient
        league={league}
        leagueName={leagueName}
        teamId={id}
        teamName={name}
        logo={logo}
        overview={ov}
      />
    </>
  );
}
