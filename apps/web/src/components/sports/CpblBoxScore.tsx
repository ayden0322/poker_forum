'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// ============ 型別定義 ============

interface CpblGameDetail {
  visitingTeam: string;
  homeTeam: string;
  visitingTeamLogo: string | null;
  homeTeamLogo: string | null;
  visitingScore: number;
  homeScore: number;
  gameStatus: number | null;
  gameStatusText: string | null;
  winPitcher: string | null;
  losePitcher: string | null;
  savePitcher: string | null;
  visitingStarter: string | null;
  homeStarter: string | null;
  gameDuration: string | null;
  weather: string | null;
  audience: number | null;
  stadium: string | null;
  headUmpire: string | null;
  visitingRecord: string | null;
  homeRecord: string | null;
}

interface ScoreboardEntry {
  teamAbbr: string;
  inning: number;
  runs: number;
  hits: number;
  errors: number;
}

interface BattingEntry {
  name: string;
  uniformNo: string;
  side: string;
  roleType: string;
  order: number;
  battingOrder: number;
  plateAppearances: number;
  atBats: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbi: number;
  runs: number;
  strikeouts: number;
  walks: number;
  hitByPitch: number;
  stolenBases: number;
  sacrificeHits: number;
  sacrificeFlies: number;
  doublePlays: number;
  totalBases: number;
  errors: number;
  isMvp: boolean;
}

interface PitchingEntry {
  name: string;
  uniformNo: string;
  team: string;
  inningsPitched: string;
  hits: number;
  runs: number;
  earnedRuns: number;
  strikeouts: number;
  walks: number;
  homeRuns: number;
  pitchCount: number;
  strikes: number;
  balls: number;
  era: string | null;
  result: string | null;
}

interface BoxScoreData {
  gameSno: number;
  year: number;
  kindCode: string;
  gameDetail: CpblGameDetail | null;
  scoreboard: ScoreboardEntry[];
  batting: BattingEntry[];
  pitching: PitchingEntry[];
  liveLog: any[];
}

// ============ 主元件 ============

export default function CpblBoxScore({ gameSno, year }: { gameSno: number; year?: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['cpbl-boxscore', gameSno, year],
    queryFn: () =>
      apiFetch<{ success: boolean; data: BoxScoreData }>(
        `/cpbl/games/${gameSno}/boxscore${year ? `?year=${year}` : ''}`,
      ),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <span className="animate-pulse text-gray-400">載入 Box Score 中...</span>
      </div>
    );
  }

  if (isError || !data?.data) {
    return (
      <div className="text-center py-8 text-gray-400">
        無法載入 CPBL 官方 Box Score
      </div>
    );
  }

  const box = data.data;
  const detail = box.gameDetail;
  const isFinished = detail?.gameStatus === 3;

  return (
    <div className="space-y-4">
      {/* 比賽資訊卡 */}
      {detail && <GameInfoCard detail={detail} isFinished={isFinished} />}

      {/* 逐局比分 */}
      {box.scoreboard.length > 0 && (
        <CpblInningsTable scoreboard={box.scoreboard} detail={detail} />
      )}

      {/* 打擊成績 */}
      {box.batting.length > 0 && (
        <BattingTable
          batting={box.batting}
          visitingTeam={detail?.visitingTeam ?? '客隊'}
          homeTeam={detail?.homeTeam ?? '主隊'}
        />
      )}

      {/* 投球成績 */}
      {box.pitching.length > 0 && (
        <PitchingTable pitching={box.pitching} />
      )}
    </div>
  );
}

// ============ 比賽資訊卡 ============

function GameInfoCard({ detail, isFinished }: { detail: CpblGameDetail; isFinished: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <h3 className="font-bold text-gray-800">比賽資訊</h3>
        {detail.gameStatusText && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isFinished
              ? 'bg-gray-100 text-gray-600'
              : 'bg-red-100 text-red-700 animate-pulse'
          }`}>
            {detail.gameStatusText}
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {detail.stadium && (
            <InfoItem label="球場" value={detail.stadium} />
          )}
          {detail.gameDuration && (
            <InfoItem label="比賽時間" value={detail.gameDuration} />
          )}
          {detail.audience && (
            <InfoItem label="觀眾" value={detail.audience.toLocaleString()} />
          )}
          {detail.weather && (
            <InfoItem label="天氣" value={detail.weather} />
          )}
          {detail.winPitcher && (
            <InfoItem label="勝投" value={detail.winPitcher} highlight="green" />
          )}
          {detail.losePitcher && (
            <InfoItem label="敗投" value={detail.losePitcher} highlight="red" />
          )}
          {detail.savePitcher && (
            <InfoItem label="救援" value={detail.savePitcher} highlight="blue" />
          )}
          {detail.headUmpire && (
            <InfoItem label="主審" value={detail.headUmpire} />
          )}
        </div>
      </div>
    </div>
  );
}

function InfoItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'green' | 'red' | 'blue';
}) {
  const colorClass = highlight === 'green'
    ? 'text-green-700'
    : highlight === 'red'
    ? 'text-red-600'
    : highlight === 'blue'
    ? 'text-blue-600'
    : 'text-gray-900';

  return (
    <div className="bg-gray-50 rounded-lg p-2.5">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`font-medium ${colorClass}`}>{value}</div>
    </div>
  );
}

// ============ 逐局比分表 ============

function CpblInningsTable({
  scoreboard,
  detail,
}: {
  scoreboard: ScoreboardEntry[];
  detail: CpblGameDetail | null;
}) {
  // 找出所有隊伍
  const teams = [...new Set(scoreboard.map((s) => s.teamAbbr))];
  const awayTeam = teams[0] ?? '客隊'; // scoreboard 第一個通常是客隊（先攻）
  const homeTeam = teams[1] ?? '主隊';

  // 最大局數
  const maxInning = Math.max(9, ...scoreboard.map((s) => s.inning));

  // 建立查找表
  const getScore = (team: string, inning: number): number | null => {
    const entry = scoreboard.find((s) => s.teamAbbr === team && s.inning === inning);
    return entry ? entry.runs : null;
  };

  // 計算 R / H / E 合計
  const totalRuns = (team: string) =>
    scoreboard.filter((s) => s.teamAbbr === team).reduce((sum, s) => sum + s.runs, 0);
  const totalHits = (team: string) =>
    scoreboard.filter((s) => s.teamAbbr === team).reduce((sum, s) => sum + s.hits, 0);
  const totalErrors = (team: string) =>
    scoreboard.filter((s) => s.teamAbbr === team).reduce((sum, s) => sum + s.errors, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="font-bold text-gray-800">逐局比分</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 bg-gray-50 border-b border-gray-100">
              <th className="text-left px-3 py-2 font-medium min-w-[80px]">球隊</th>
              {Array.from({ length: maxInning }, (_, i) => (
                <th key={i} className="text-center px-1.5 py-2 font-medium tabular-nums w-8">
                  {i + 1}
                </th>
              ))}
              <th className="text-center px-2.5 py-2 font-bold text-gray-700 bg-gray-100">R</th>
              <th className="text-center px-2.5 py-2 font-medium text-gray-600">H</th>
              <th className="text-center px-2.5 py-2 font-medium text-gray-600">E</th>
            </tr>
          </thead>
          <tbody>
            {[awayTeam, homeTeam].map((team, idx) => {
              const isWinner =
                detail && (idx === 0
                  ? detail.visitingScore > detail.homeScore
                  : detail.homeScore > detail.visitingScore);
              return (
                <tr key={team} className={`border-b border-gray-100 last:border-b-0 ${isWinner ? 'bg-blue-50/50' : ''}`}>
                  <td className={`px-3 py-2 font-medium whitespace-nowrap ${isWinner ? 'text-blue-700' : ''}`}>
                    {team}
                  </td>
                  {Array.from({ length: maxInning }, (_, i) => {
                    const score = getScore(team, i + 1);
                    return (
                      <td
                        key={i}
                        className={`text-center px-1.5 py-2 tabular-nums ${
                          score !== null && score > 0 ? 'text-red-600 font-bold' : 'text-gray-400'
                        }`}
                      >
                        {score ?? '-'}
                      </td>
                    );
                  })}
                  <td className={`text-center px-2.5 py-2 font-bold tabular-nums bg-gray-50 ${isWinner ? 'text-blue-700' : 'text-gray-800'}`}>
                    {totalRuns(team)}
                  </td>
                  <td className="text-center px-2.5 py-2 tabular-nums text-gray-600">
                    {totalHits(team)}
                  </td>
                  <td className="text-center px-2.5 py-2 tabular-nums text-gray-600">
                    {totalErrors(team)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ 打擊成績表 ============

function BattingTable({
  batting,
  visitingTeam,
  homeTeam,
}: {
  batting: BattingEntry[];
  visitingTeam: string;
  homeTeam: string;
}) {
  const awayBatters = batting.filter((b) => b.side === '1');
  const homeBatters = batting.filter((b) => b.side === '2');

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="font-bold text-gray-800">打擊成績</h3>
      </div>

      {/* 客隊打擊 */}
      <div className="border-b border-gray-200">
        <div className="px-4 py-2 bg-red-50 text-sm font-medium text-red-800">
          {visitingTeam}（客）
        </div>
        <BattingSubTable batters={awayBatters} />
      </div>

      {/* 主隊打擊 */}
      <div>
        <div className="px-4 py-2 bg-blue-50 text-sm font-medium text-blue-800">
          {homeTeam}（主）
        </div>
        <BattingSubTable batters={homeBatters} />
      </div>
    </div>
  );
}

function BattingSubTable({ batters }: { batters: BattingEntry[] }) {
  // 計算合計
  const totals = batters.reduce(
    (acc, b) => ({
      pa: acc.pa + b.plateAppearances,
      ab: acc.ab + b.atBats,
      h: acc.h + b.hits,
      hr: acc.hr + b.homeRuns,
      rbi: acc.rbi + b.rbi,
      r: acc.r + b.runs,
      so: acc.so + b.strikeouts,
      bb: acc.bb + b.walks,
      sb: acc.sb + b.stolenBases,
      tb: acc.tb + b.totalBases,
    }),
    { pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, r: 0, so: 0, bb: 0, sb: 0, tb: 0 },
  );

  const avg = totals.ab > 0 ? (totals.h / totals.ab).toFixed(3) : '.000';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 border-b border-gray-100 text-xs">
            <th className="text-left px-3 py-1.5 font-medium">#</th>
            <th className="text-left px-2 py-1.5 font-medium min-w-[72px]">打者</th>
            <th className="text-center px-1.5 py-1.5 font-medium" title="打席">PA</th>
            <th className="text-center px-1.5 py-1.5 font-medium" title="打數">AB</th>
            <th className="text-center px-1.5 py-1.5 font-medium" title="安打">H</th>
            <th className="text-center px-1.5 py-1.5 font-medium" title="全壘打">HR</th>
            <th className="text-center px-1.5 py-1.5 font-medium" title="打點">RBI</th>
            <th className="text-center px-1.5 py-1.5 font-medium" title="得分">R</th>
            <th className="text-center px-1.5 py-1.5 font-medium" title="三振">SO</th>
            <th className="text-center px-1.5 py-1.5 font-medium" title="四壞">BB</th>
            <th className="text-center px-1.5 py-1.5 font-medium" title="盜壘">SB</th>
            <th className="text-center px-1.5 py-1.5 font-medium" title="打擊率">AVG</th>
          </tr>
        </thead>
        <tbody>
          {batters.map((b, idx) => {
            const battingAvg = b.atBats > 0 ? (b.hits / b.atBats).toFixed(3) : '-';
            const isSub = b.roleType !== '先發';
            return (
              <tr
                key={`${b.uniformNo}-${idx}`}
                className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  b.isMvp ? 'bg-yellow-50' : ''
                } ${isSub ? 'text-gray-500' : ''}`}
              >
                <td className="px-3 py-1.5 text-gray-400 tabular-nums text-xs">
                  {b.battingOrder || '-'}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <span className={`font-medium ${b.isMvp ? 'text-yellow-700' : ''}`}>
                    {b.name}
                  </span>
                  <span className="text-gray-400 text-xs ml-1">#{b.uniformNo}</span>
                  {isSub && <span className="text-gray-400 text-xs ml-1">({b.roleType})</span>}
                  {b.isMvp && <span className="text-yellow-600 text-xs ml-1">MVP</span>}
                </td>
                <td className="text-center px-1.5 py-1.5 tabular-nums">{b.plateAppearances}</td>
                <td className="text-center px-1.5 py-1.5 tabular-nums">{b.atBats}</td>
                <td className={`text-center px-1.5 py-1.5 tabular-nums font-medium ${b.hits > 0 ? 'text-blue-600' : ''}`}>
                  {b.hits}
                </td>
                <td className={`text-center px-1.5 py-1.5 tabular-nums ${b.homeRuns > 0 ? 'text-red-600 font-bold' : ''}`}>
                  {b.homeRuns}
                </td>
                <td className={`text-center px-1.5 py-1.5 tabular-nums ${b.rbi > 0 ? 'text-green-600 font-medium' : ''}`}>
                  {b.rbi}
                </td>
                <td className="text-center px-1.5 py-1.5 tabular-nums">{b.runs}</td>
                <td className="text-center px-1.5 py-1.5 tabular-nums text-gray-500">{b.strikeouts}</td>
                <td className="text-center px-1.5 py-1.5 tabular-nums">{b.walks}</td>
                <td className="text-center px-1.5 py-1.5 tabular-nums">{b.stolenBases}</td>
                <td className="text-center px-1.5 py-1.5 tabular-nums text-gray-500">{battingAvg}</td>
              </tr>
            );
          })}
          {/* 合計行 */}
          <tr className="bg-gray-50 font-medium border-t border-gray-200">
            <td className="px-3 py-1.5"></td>
            <td className="px-2 py-1.5 text-gray-700">合計</td>
            <td className="text-center px-1.5 py-1.5 tabular-nums">{totals.pa}</td>
            <td className="text-center px-1.5 py-1.5 tabular-nums">{totals.ab}</td>
            <td className="text-center px-1.5 py-1.5 tabular-nums text-blue-600">{totals.h}</td>
            <td className="text-center px-1.5 py-1.5 tabular-nums">{totals.hr}</td>
            <td className="text-center px-1.5 py-1.5 tabular-nums">{totals.rbi}</td>
            <td className="text-center px-1.5 py-1.5 tabular-nums">{totals.r}</td>
            <td className="text-center px-1.5 py-1.5 tabular-nums">{totals.so}</td>
            <td className="text-center px-1.5 py-1.5 tabular-nums">{totals.bb}</td>
            <td className="text-center px-1.5 py-1.5 tabular-nums">{totals.sb}</td>
            <td className="text-center px-1.5 py-1.5 tabular-nums text-gray-500">{avg}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ============ 投球成績表 ============

function PitchingTable({ pitching }: { pitching: PitchingEntry[] }) {
  // 依 side 分組（投球資料的 team 欄位可能為空，用順序判斷）
  // CPBL 投球資料的排列通常是：先列客隊投手，再列主隊投手
  // 用 result 欄位找到勝/敗投來輔助判斷
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="font-bold text-gray-800">投球成績</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-100 text-xs">
              <th className="text-left px-3 py-1.5 font-medium min-w-[72px]">投手</th>
              <th className="text-center px-1.5 py-1.5 font-medium" title="結果">W/L</th>
              <th className="text-center px-1.5 py-1.5 font-medium" title="投球局數">IP</th>
              <th className="text-center px-1.5 py-1.5 font-medium" title="被安打">H</th>
              <th className="text-center px-1.5 py-1.5 font-medium" title="失分">R</th>
              <th className="text-center px-1.5 py-1.5 font-medium" title="自責分">ER</th>
              <th className="text-center px-1.5 py-1.5 font-medium" title="三振">SO</th>
              <th className="text-center px-1.5 py-1.5 font-medium" title="四壞">BB</th>
              <th className="text-center px-1.5 py-1.5 font-medium" title="被全壘打">HR</th>
              <th className="text-center px-1.5 py-1.5 font-medium" title="用球數">NP</th>
              <th className="text-center px-1.5 py-1.5 font-medium" title="好球">S</th>
              <th className="text-center px-1.5 py-1.5 font-medium" title="壞球">B</th>
            </tr>
          </thead>
          <tbody>
            {pitching.map((p, idx) => {
              const resultColor = p.result === '勝'
                ? 'text-green-700 bg-green-50'
                : p.result === '敗'
                ? 'text-red-600 bg-red-50'
                : p.result === '救援' || p.result === 'S'
                ? 'text-blue-600 bg-blue-50'
                : p.result === '中繼' || p.result === 'H'
                ? 'text-purple-600 bg-purple-50'
                : '';

              return (
                <tr
                  key={`${p.uniformNo}-${idx}`}
                  className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-gray-400 text-xs ml-1">#{p.uniformNo}</span>
                  </td>
                  <td className="text-center px-1.5 py-1.5">
                    {p.result ? (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${resultColor}`}>
                        {p.result}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="text-center px-1.5 py-1.5 tabular-nums font-medium">{p.inningsPitched}</td>
                  <td className="text-center px-1.5 py-1.5 tabular-nums">{p.hits}</td>
                  <td className="text-center px-1.5 py-1.5 tabular-nums">{p.runs}</td>
                  <td className={`text-center px-1.5 py-1.5 tabular-nums ${p.earnedRuns > 0 ? 'text-red-500' : ''}`}>
                    {p.earnedRuns}
                  </td>
                  <td className={`text-center px-1.5 py-1.5 tabular-nums ${p.strikeouts >= 5 ? 'text-blue-600 font-medium' : ''}`}>
                    {p.strikeouts}
                  </td>
                  <td className="text-center px-1.5 py-1.5 tabular-nums">{p.walks}</td>
                  <td className={`text-center px-1.5 py-1.5 tabular-nums ${p.homeRuns > 0 ? 'text-red-600' : ''}`}>
                    {p.homeRuns}
                  </td>
                  <td className="text-center px-1.5 py-1.5 tabular-nums text-gray-500">{p.pitchCount}</td>
                  <td className="text-center px-1.5 py-1.5 tabular-nums text-gray-500">{p.strikes}</td>
                  <td className="text-center px-1.5 py-1.5 tabular-nums text-gray-500">{p.balls}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
