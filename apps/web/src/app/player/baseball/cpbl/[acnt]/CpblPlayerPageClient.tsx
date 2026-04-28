'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

interface PlayerProfile {
  name: string;
  team: string;
  uniformNo: string;
  position: string;
  battingThrowing: string;
  height: string;
  weight: string;
  birthday: string;
  debut: string;
  education: string;
  nationality: string;
  draft: string;
  photoUrl: string | null;
}

interface BattingSeason {
  Year: string;
  TeamAbbrName: string;
  TotalGames: number;
  PlateAppearances: number;
  HitCnt: number;          // CPBL 命名：HitCnt = 打數(AB)
  RunBattedINCnt: number;  // 打點
  ScoreCnt: number;        // 得分
  HittingCnt: number;      // CPBL 命名：HittingCnt = 安打數(H)
  OneBaseHitCnt: number;
  TwoBaseHitCnt: number;
  ThreeBaseHitCnt: number;
  HomeRunCnt: number;
  TotalBases: number;
  StrikeOutCnt: number;
  StealBaseOKCnt: number;
  Obp: number;
  Slg: number;
  Avg: number;
  Ops: number;
  BasesONBallsCnt: number;
  HitBYPitchCnt: number;
  SacrificeFlyCnt: number;
}

interface PitchSeason {
  Year: string;
  TeamAbbrName: string;
  TotalGames: number;
  WinCnt: number;
  LoseCnt: number;
  SaveCnt: number;
  HoldCnt: number;
  Era: number;
  InningPitched?: string;
  InningPitchedCnt?: number;
  StrikeOutCnt: number;
  BasesONBallsCnt: number;
  HitCnt: number;
  HomeRunCnt: number;
  Whip?: number;
}

interface PlayerData {
  acnt: string;
  profile: PlayerProfile;
  isPitcher: boolean;
  batting: {
    seasons: BattingSeason[];
    career: BattingSeason | null;
  };
  pitching: {
    seasons: PitchSeason[];
    career: PitchSeason | null;
  };
}

interface Response {
  success: boolean;
  data: PlayerData | null;
}

function teamGradient(teamName: string): string {
  // CPBL 各隊主色
  if (teamName.includes('中信') || teamName.includes('兄弟')) return 'from-yellow-700 to-yellow-900';
  if (teamName.includes('富邦') || teamName.includes('悍將')) return 'from-blue-800 to-blue-950';
  if (teamName.includes('味全') || teamName.includes('龍'))   return 'from-red-700 to-red-900';
  if (teamName.includes('樂天') || teamName.includes('桃猿')) return 'from-pink-700 to-rose-900';
  if (teamName.includes('統一') || teamName.includes('獅'))   return 'from-orange-700 to-amber-900';
  if (teamName.includes('台鋼') || teamName.includes('雄鷹')) return 'from-emerald-700 to-emerald-900';
  return 'from-gray-700 to-gray-900';
}

export default function CpblPlayerPageClient({ acnt }: { acnt: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cpbl-player', acnt],
    queryFn: () => apiFetch<Response>(`/cpbl/players/${acnt}`),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
          <Link href="/" className="hover:text-blue-600">首頁</Link>
          <span>/</span>
          <Link href="/board/cpbl" className="hover:text-blue-600">中華職棒</Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">球員 #{acnt}</span>
        </nav>
        <div className="bg-gray-100 rounded-2xl p-12 text-center">
          <span className="animate-pulse text-gray-400">載入球員資料中...</span>
        </div>
      </div>
    );
  }

  if (!data?.data) {
    return (
      <div className="max-w-5xl mx-auto text-center py-20 text-gray-400">
        找不到球員 #{acnt}
      </div>
    );
  }

  const { profile, isPitcher, batting, pitching } = data.data;
  const gradient = teamGradient(profile.team);

  return (
    <div className="max-w-5xl mx-auto">
      {/* 麵包屑 */}
      <nav className="text-sm text-gray-500 mb-4 flex items-center gap-1">
        <Link href="/" className="hover:text-blue-600">首頁</Link>
        <span>/</span>
        <Link href="/board/cpbl" className="hover:text-blue-600">中華職棒</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{profile.name}</span>
      </nav>

      {/* 球員頭卡 */}
      <div className={`bg-gradient-to-r ${gradient} text-white rounded-2xl p-6 mb-4 shadow-lg`}>
        <div className="flex items-start gap-6 flex-wrap">
          {profile.photoUrl && (
            <img
              src={profile.photoUrl}
              alt={profile.name}
              className="w-32 h-32 bg-white/10 rounded-xl object-cover shrink-0"
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-white/70 text-sm mb-1">{profile.team}</div>
            <h1 className="text-3xl font-bold mb-2">
              {profile.name}
              {profile.uniformNo && (
                <span className="ml-3 text-2xl text-white/70">#{profile.uniformNo}</span>
              )}
              {isPitcher && <span className="ml-3 text-sm bg-white/20 px-2 py-1 rounded">投手</span>}
              {!isPitcher && <span className="ml-3 text-sm bg-white/20 px-2 py-1 rounded">{profile.position}</span>}
            </h1>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mt-4">
              <InfoCell label="位置" value={profile.position} />
              <InfoCell label="投打" value={profile.battingThrowing} />
              <InfoCell label="身高/體重" value={`${profile.height} / ${profile.weight}`} />
              <InfoCell label="生日" value={profile.birthday} />
              {profile.debut && <InfoCell label="初出場" value={profile.debut} />}
              {profile.education && <InfoCell label="學歷" value={profile.education} />}
              {profile.nationality && <InfoCell label="國籍" value={profile.nationality} />}
              {profile.draft && <InfoCell label="選秀" value={profile.draft} />}
            </div>
          </div>
        </div>
      </div>

      {/* 主要顯示：投手 stats / 打者 stats */}
      {isPitcher ? (
        <PitchingSection seasons={pitching.seasons} career={pitching.career} />
      ) : (
        <BattingSection seasons={batting.seasons} career={batting.career} />
      )}

      <div className="text-xs text-gray-400 text-center mt-6 pb-4">
        資料來源：CPBL 中華職棒大聯盟官方網站
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-white/60 text-xs">{label}</div>
      <div className="font-medium">{value || '—'}</div>
    </div>
  );
}

// ============ 打擊統計 ============

function BattingSection({
  seasons,
  career,
}: {
  seasons: BattingSeason[];
  career: BattingSeason | null;
}) {
  // 抓最新賽季
  const latest = seasons.length > 0
    ? seasons.reduce((a, b) => (parseInt(a.Year) > parseInt(b.Year) ? a : b))
    : null;

  return (
    <>
      {/* 本季亮點卡片 */}
      {latest && (
        <div className="bg-white rounded-xl border border-blue-100 p-4 mb-4">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span>🎯</span>
            <span>{latest.Year} 賽季打擊統計</span>
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <StatBox label="打擊率" value={(latest.Avg ?? 0).toFixed(3)} />
            <StatBox label="全壘打" value={latest.HomeRunCnt} highlight={latest.HomeRunCnt >= 5} />
            <StatBox label="打點" value={latest.RunBattedINCnt} />
            <StatBox label="得分" value={latest.ScoreCnt} />
            <StatBox label="安打" value={latest.HittingCnt} />
            <StatBox label="OPS" value={(latest.Ops ?? 0).toFixed(3)} />
            <StatBox label="出賽數" value={latest.TotalGames} />
            <StatBox label="打席" value={latest.PlateAppearances} />
            <StatBox label="打數" value={latest.HitCnt} />
            <StatBox label="二壘安打" value={latest.TwoBaseHitCnt} />
            <StatBox label="盜壘" value={latest.StealBaseOKCnt} />
            <StatBox label="三振" value={latest.StrikeOutCnt} dim />
          </div>
        </div>
      )}

      {/* 各年度打擊紀錄 */}
      {seasons.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="font-bold text-gray-800">各年度打擊紀錄</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100 text-xs">
                  <th className="text-left px-3 py-2 font-medium">年度</th>
                  <th className="text-left px-2 py-2 font-medium">球隊</th>
                  <th className="text-center px-2 py-2 font-medium">G</th>
                  <th className="text-center px-2 py-2 font-medium">PA</th>
                  <th className="text-center px-2 py-2 font-medium">AB</th>
                  <th className="text-center px-2 py-2 font-medium">H</th>
                  <th className="text-center px-2 py-2 font-medium">2B</th>
                  <th className="text-center px-2 py-2 font-medium">HR</th>
                  <th className="text-center px-2 py-2 font-medium">RBI</th>
                  <th className="text-center px-2 py-2 font-medium">R</th>
                  <th className="text-center px-2 py-2 font-medium">SB</th>
                  <th className="text-center px-2 py-2 font-medium">BB</th>
                  <th className="text-center px-2 py-2 font-medium">SO</th>
                  <th className="text-center px-2 py-2 font-medium">AVG</th>
                  <th className="text-center px-2 py-2 font-medium">OBP</th>
                  <th className="text-center px-2 py-2 font-medium">SLG</th>
                  <th className="text-center px-2 py-2 font-medium">OPS</th>
                </tr>
              </thead>
              <tbody>
                {[...seasons]
                  .sort((a, b) => parseInt(b.Year) - parseInt(a.Year))
                  .map((s, idx) => (
                    <tr key={`${s.Year}-${idx}`} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium tabular-nums">{s.Year}</td>
                      <td className="px-2 py-2 text-gray-600">{s.TeamAbbrName}</td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.TotalGames}</td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.PlateAppearances}</td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.HitCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums font-medium">{s.HittingCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.TwoBaseHitCnt}</td>
                      <td className={`text-center px-2 py-2 tabular-nums ${s.HomeRunCnt > 0 ? 'text-red-600 font-bold' : ''}`}>
                        {s.HomeRunCnt}
                      </td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.RunBattedINCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.ScoreCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.StealBaseOKCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.BasesONBallsCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums text-gray-500">{s.StrikeOutCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums font-medium text-blue-600">
                        {(s.Avg ?? 0).toFixed(3)}
                      </td>
                      <td className="text-center px-2 py-2 tabular-nums text-gray-500">{(s.Obp ?? 0).toFixed(3)}</td>
                      <td className="text-center px-2 py-2 tabular-nums text-gray-500">{(s.Slg ?? 0).toFixed(3)}</td>
                      <td className="text-center px-2 py-2 tabular-nums text-gray-700">{(s.Ops ?? 0).toFixed(3)}</td>
                    </tr>
                  ))}
                {/* 生涯合計 */}
                {career && (
                  <tr className="bg-gray-50 font-medium border-t-2 border-gray-200">
                    <td className="px-3 py-2" colSpan={2}>生涯合計</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.TotalGames}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.PlateAppearances}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.HitCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.HittingCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.TwoBaseHitCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.HomeRunCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.RunBattedINCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.ScoreCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.StealBaseOKCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.BasesONBallsCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.StrikeOutCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums text-blue-600">{(career.Avg ?? 0).toFixed(3)}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{(career.Obp ?? 0).toFixed(3)}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{(career.Slg ?? 0).toFixed(3)}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{(career.Ops ?? 0).toFixed(3)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ============ 投球統計 ============

function PitchingSection({
  seasons,
  career,
}: {
  seasons: PitchSeason[];
  career: PitchSeason | null;
}) {
  const latest = seasons.length > 0
    ? seasons.reduce((a, b) => (parseInt(a.Year) > parseInt(b.Year) ? a : b))
    : null;

  return (
    <>
      {latest && (
        <div className="bg-white rounded-xl border border-green-100 p-4 mb-4">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span>⚾</span>
            <span>{latest.Year} 賽季投球統計</span>
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <StatBox label="防禦率" value={(latest.Era ?? 0).toFixed(2)} highlight={latest.Era < 3} />
            <StatBox label="勝/敗" value={`${latest.WinCnt}-${latest.LoseCnt}`} />
            <StatBox label="救援" value={latest.SaveCnt} />
            <StatBox label="中繼" value={latest.HoldCnt} />
            <StatBox label="三振" value={latest.StrikeOutCnt} highlight={latest.StrikeOutCnt >= 50} />
            <StatBox label="出賽數" value={latest.TotalGames} />
          </div>
        </div>
      )}

      {seasons.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="font-bold text-gray-800">各年度投球紀錄</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100 text-xs">
                  <th className="text-left px-3 py-2 font-medium">年度</th>
                  <th className="text-left px-2 py-2 font-medium">球隊</th>
                  <th className="text-center px-2 py-2 font-medium">G</th>
                  <th className="text-center px-2 py-2 font-medium">W</th>
                  <th className="text-center px-2 py-2 font-medium">L</th>
                  <th className="text-center px-2 py-2 font-medium">SV</th>
                  <th className="text-center px-2 py-2 font-medium">HLD</th>
                  <th className="text-center px-2 py-2 font-medium">SO</th>
                  <th className="text-center px-2 py-2 font-medium">BB</th>
                  <th className="text-center px-2 py-2 font-medium">H</th>
                  <th className="text-center px-2 py-2 font-medium">HR</th>
                  <th className="text-center px-2 py-2 font-medium">ERA</th>
                </tr>
              </thead>
              <tbody>
                {[...seasons]
                  .sort((a, b) => parseInt(b.Year) - parseInt(a.Year))
                  .map((s, idx) => (
                    <tr key={`${s.Year}-${idx}`} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium tabular-nums">{s.Year}</td>
                      <td className="px-2 py-2 text-gray-600">{s.TeamAbbrName}</td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.TotalGames}</td>
                      <td className="text-center px-2 py-2 tabular-nums text-green-600 font-medium">{s.WinCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums text-red-500">{s.LoseCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.SaveCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.HoldCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums font-medium text-blue-600">{s.StrikeOutCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.BasesONBallsCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.HitCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums">{s.HomeRunCnt}</td>
                      <td className="text-center px-2 py-2 tabular-nums font-bold">{(s.Era ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                {career && (
                  <tr className="bg-gray-50 font-medium border-t-2 border-gray-200">
                    <td className="px-3 py-2" colSpan={2}>生涯合計</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.TotalGames}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.WinCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.LoseCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.SaveCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.HoldCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.StrikeOutCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.BasesONBallsCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.HitCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{career.HomeRunCnt}</td>
                    <td className="text-center px-2 py-2 tabular-nums">{(career.Era ?? 0).toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function StatBox({
  label,
  value,
  highlight = false,
  dim = false,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${
        highlight ? 'text-red-600' : dim ? 'text-gray-400' : 'text-gray-900'
      }`}>
        {value}
      </div>
    </div>
  );
}
