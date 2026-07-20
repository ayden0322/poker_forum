'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth';
import { levelName } from '@/lib/member';
import AvatarWithFrame from '@/components/member/AvatarWithFrame';
import MainBadge from '@/components/member/MainBadge';
import CompetitionRecord from '@/components/predictions/CompetitionRecord';
import { TITLE_TOKEN, type AuthorCosmetics, type Rarity } from '@/lib/cosmetics';

const BOARD_LABEL: Record<string, string> = { ACCURACY: '神算王', PROFIT: '獲利王', INFLUENCE: '人氣王' };

interface PinnedBadge {
  name: string;
  iconKey: string | null;
  assetUrl: string | null;
  rarity: Rarity;
}

interface UserProfile {
  id: string;
  nickname: string;
  avatar: string | null;
  level: number;
  role: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  createdAt: string;
  cosmetics: AuthorCosmetics | null;
  pinnedBadges: PinnedBadge[];
  record: { settled: number; winRate: number; currentStreak: number; bestStreak: number; followedCount: number } | null;
  championReign: { board: string; reignTo: string } | null;
}

interface PostItem {
  id: string;
  title: string;
  board: { name: string; slug: string };
  replyCount: number;
  pushCount: number;
  createdAt: string;
}

interface ReplyItem {
  id: string;
  content: string;
  floorNumber: number;
  createdAt: string;
  post: { id: string; title: string; board: { name: string; slug: string } };
}

interface FollowUser {
  id: string;
  nickname: string;
  avatar: string | null;
  level: number;
}


export function UserProfileClient({ nickname }: { nickname: string }) {
  const { user: currentUser, accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'posts' | 'replies' | 'following' | 'competition'>('posts');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user', nickname],
    queryFn: () => apiFetch<{ data: UserProfile }>(`/users/${nickname}`, { token: accessToken ?? undefined }).then(r => r.data),
  });

  const { data: posts } = useQuery({
    queryKey: ['user', nickname, 'posts'],
    queryFn: () => apiFetch<{ data: { items: PostItem[] } }>(`/users/${nickname}/posts`, { token: accessToken ?? undefined }).then(r => r.data.items),
    enabled: activeTab === 'posts',
  });

  const { data: replies } = useQuery({
    queryKey: ['user', nickname, 'replies'],
    queryFn: () => apiFetch<{ data: { items: ReplyItem[] } }>(`/users/${nickname}/replies`).then(r => r.data.items),
    enabled: activeTab === 'replies',
  });

  const { data: following } = useQuery({
    queryKey: ['user', nickname, 'following'],
    queryFn: () => apiFetch<{ data: { items: FollowUser[] } }>(`/users/${nickname}/following`).then(r => r.data.items),
    enabled: activeTab === 'following',
  });

  const followMutation = useMutation({
    mutationFn: (action: 'follow' | 'unfollow') =>
      apiFetch(`/users/${nickname}/${action}`, {
        method: action === 'follow' ? 'POST' : 'DELETE',
        token: accessToken ?? undefined,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', nickname] }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return <div className="text-center py-20 text-gray-500">找不到此用戶</div>;
  }

  const isOwnProfile = currentUser?.nickname === nickname;

  const cos = profile.cosmetics;
  const title = cos?.title ?? null;
  // 稱號緞帶：傳說走金漸層緞帶，其餘用稀有度色的膠囊。
  const titleRibbon = title ? (
    title.rarity === 'LEGENDARY' ? (
      <span
        className="inline-block text-xs font-extrabold px-3.5 py-1 rounded-full"
        style={{ color: '#3a2c05', background: 'linear-gradient(90deg,#fde68a,#f59e0b)', boxShadow: 'inset 0 0 0 1px rgba(180,120,10,0.5), 0 2px 5px rgba(0,0,0,0.12)' }}
      >
        {title.name}
      </span>
    ) : (
      <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-gray-50 border border-gray-200" style={TITLE_TOKEN[title.rarity]}>
        {title.name}
      </span>
    )
  ) : null;

  const actionBtn = isOwnProfile ? (
    <Link
      href="/settings"
      className="px-4 py-2 text-sm bg-white/90 backdrop-blur border border-white/60 text-gray-700 rounded-lg hover:bg-white transition-colors shadow-sm"
    >
      編輯資料
    </Link>
  ) : currentUser ? (
    <button
      onClick={() => followMutation.mutate(profile.isFollowing ? 'unfollow' : 'follow')}
      disabled={followMutation.isPending}
      className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors shadow-sm ${
        profile.isFollowing
          ? 'bg-white/90 backdrop-blur border border-white/60 text-gray-700 hover:bg-white'
          : 'bg-amber-500 text-white hover:bg-amber-600'
      }`}
    >
      {followMutation.isPending ? '...' : profile.isFollowing ? '取消追蹤' : '追蹤'}
    </button>
  ) : null;

  const champion = profile.championReign;
  const rec = profile.record;

  return (
    <div className="max-w-4xl mx-auto">
      {/* 戰績身份卡：清爽白卡 + 戰績列 + 冠軍待遇 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        {/* 頂部強調條：冠軍走金、一般走 teal */}
        <div className={`h-1.5 ${champion ? 'bg-gradient-to-r from-teal-700 via-amber-500 to-amber-500' : 'bg-teal-600'}`} />

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4 sm:gap-5">
            {/* 頭像（冠軍加金光暈） */}
            <div className="relative flex-shrink-0">
              {champion && (
                <span
                  aria-hidden
                  className="absolute rounded-full pointer-events-none"
                  style={{ inset: '-22%', background: 'radial-gradient(circle, rgba(245,158,11,0.28), transparent 66%)' }}
                />
              )}
              <div className="relative">
                <AvatarWithFrame
                  avatar={profile.avatar}
                  nickname={profile.nickname}
                  size={88}
                  context="profile"
                  frame={cos?.frame ?? null}
                  effectUrl={cos?.effect?.assetUrl ?? null}
                />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{profile.nickname}</h1>
                {cos?.mainBadge && <MainBadge badge={cos.mainBadge} size={22} />}
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                  Lv.{profile.level} {levelName(profile.level)}
                </span>
                {(profile.role === 'ADMIN' || profile.role === 'SUPER_ADMIN') && (
                  <span className="px-2.5 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">管理員</span>
                )}
                {profile.role === 'MODERATOR' && (
                  <span className="px-2.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">編輯</span>
                )}
              </div>
              {/* 在位冠軍緞帶 */}
              {champion && (
                <div className="mt-2">
                  <span
                    className="inline-flex items-center gap-1 text-xs font-extrabold px-3 py-1 rounded-full"
                    style={{ color: '#5a3d05', background: 'linear-gradient(90deg,#ffe9a8,#f2c761)', boxShadow: 'inset 0 0 0 1px rgba(180,120,10,0.5)' }}
                  >
                    ◆ 本季{BOARD_LABEL[champion.board] ?? champion.board} · 在位中
                  </span>
                </div>
              )}
              {titleRibbon && <div className="mt-2">{titleRibbon}</div>}
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-sm text-gray-500">
                <span><strong className="text-gray-900">{profile.postCount}</strong> 篇文章</span>
                <span><strong className="text-gray-900">{profile.followerCount}</strong> 追蹤者</span>
                <span>追蹤 <strong className="text-gray-900">{profile.followingCount}</strong> 人</span>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                加入於 {new Date(profile.createdAt).toLocaleDateString('zh-TW')}
              </p>
            </div>

            <div className="flex-shrink-0">{actionBtn}</div>
          </div>

          {/* 戰績列（有下注紀錄才顯示）：勝率 / 連勝 / 最佳連勝 / 被跟單 */}
          {rec && rec.settled > 0 && (
            <div className="mt-5 grid grid-cols-4 rounded-xl border border-gray-100 overflow-hidden bg-gray-50/40">
              <div className="text-center py-3 border-r border-gray-100">
                <div className="text-lg font-extrabold text-teal-700 tabular-nums">{rec.winRate}%</div>
                <div className="text-[11px] text-gray-400">勝率 · {rec.settled} 場</div>
              </div>
              <div className="text-center py-3 border-r border-gray-100">
                <div className="text-lg font-extrabold text-teal-700 tabular-nums">{rec.currentStreak}</div>
                <div className="text-[11px] text-gray-400">目前連勝</div>
              </div>
              <div className="text-center py-3 border-r border-gray-100">
                <div className="text-lg font-extrabold text-amber-500 tabular-nums">{rec.bestStreak}</div>
                <div className="text-[11px] text-gray-400">最佳連勝</div>
              </div>
              <div className="text-center py-3">
                <div className="text-lg font-extrabold text-teal-700 tabular-nums">{rec.followedCount.toLocaleString()}</div>
                <div className="text-[11px] text-gray-400">被跟單</div>
              </div>
            </div>
          )}

          {/* 勳章牆：釘選的勳章（最多 3） */}
          {profile.pinnedBadges.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="text-xs font-semibold text-gray-400 mb-2.5">榮耀勳章</div>
              <div className="flex flex-wrap gap-4">
                {profile.pinnedBadges.map((b, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 w-16">
                    <MainBadge badge={b} size={40} />
                    <span className="text-[11px] text-gray-500 text-center leading-tight line-clamp-2">{b.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {(
            [
              ['posts', '發文紀錄'],
              ['replies', '回覆紀錄'],
              // 競猜紀錄：僅在競猜功能開啟（有戰績資料）時出現
              ...(rec ? [['competition', '競猜紀錄'] as const] : []),
              ['following', '追蹤中'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* 發文紀錄 */}
          {activeTab === 'posts' && (
            <div className="space-y-2">
              {posts?.length === 0 && <p className="text-gray-400 text-sm py-4 text-center">尚無發文</p>}
              {posts?.map((post) => (
                <div key={post.id} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <Link href={`/post/${post.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block">
                      {post.title}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">
                      [{post.board.name}] · {new Date(post.createdAt).toLocaleDateString('zh-TW')}
                    </p>
                  </div>
                  <div className="text-xs text-gray-400 flex gap-3 flex-shrink-0">
                    <span>回覆 {post.replyCount}</span>
                    <span>推 {post.pushCount}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 回覆紀錄 */}
          {activeTab === 'replies' && (
            <div className="space-y-2">
              {replies?.length === 0 && <p className="text-gray-400 text-sm py-4 text-center">尚無回覆</p>}
              {replies?.map((reply) => (
                <div key={reply.id} className="py-3 border-b border-gray-50 last:border-0">
                  <Link href={`/post/${reply.post.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700 block mb-1">
                    {reply.post.title}
                  </Link>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-1">
                    B{reply.floorNumber}：{reply.content}
                  </p>
                  <p className="text-xs text-gray-400">
                    [{reply.post.board.name}] · {new Date(reply.createdAt).toLocaleDateString('zh-TW')}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* 競猜紀錄（共用元件；隱私分流本人/訪客自動一致） */}
          {activeTab === 'competition' && rec && (
            <CompetitionRecord nickname={nickname} embedded />
          )}

          {/* 追蹤中 */}
          {activeTab === 'following' && (
            <div className="space-y-2">
              {following?.length === 0 && <p className="text-gray-400 text-sm py-4 text-center">尚未追蹤任何人</p>}
              {following?.map((u) => (
                <Link
                  key={u.id}
                  href={`/user/${u.nickname}`}
                  className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded px-2 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-sm font-bold text-white overflow-hidden shrink-0">
                    {u.avatar ? (
                      <img src={u.avatar} alt="" className="w-full h-full object-cover" />
                    ) : u.nickname.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{u.nickname}</div>
                    <div className="text-xs text-gray-400">Lv.{u.level} {levelName(u.level)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
