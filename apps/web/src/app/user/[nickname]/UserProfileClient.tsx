'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth';

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

const LEVEL_NAMES = ['', '新手', '初學者', '進階', '老手', '高手', '大師'];

export function UserProfileClient({ nickname }: { nickname: string }) {
  const { user: currentUser, accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'posts' | 'replies' | 'following'>('posts');

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

  return (
    <div className="max-w-4xl mx-auto">
      {/* 個人資料卡片 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0">
            {profile.avatar ? (
              <Image src={profile.avatar} alt={profile.nickname} width={80} height={80} className="rounded-full" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-2xl font-bold text-white">
                {profile.nickname.charAt(0)}
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{profile.nickname}</h1>
              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                Lv.{profile.level} {LEVEL_NAMES[profile.level]}
              </span>
              {profile.role === 'ADMIN' && (
                <span className="px-2.5 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">管理員</span>
              )}
              {profile.role === 'MODERATOR' && (
                <span className="px-2.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">版主</span>
              )}
            </div>
            <div className="flex gap-6 mt-3 text-sm text-gray-500">
              <span><strong className="text-gray-900">{profile.postCount}</strong> 篇文章</span>
              <span><strong className="text-gray-900">{profile.followerCount}</strong> 位追蹤者</span>
              <span>追蹤 <strong className="text-gray-900">{profile.followingCount}</strong> 人</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              加入於 {new Date(profile.createdAt).toLocaleDateString('zh-TW')}
            </p>
          </div>
          <div className="flex gap-2">
            {isOwnProfile ? (
              <Link
                href="/settings"
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                編輯資料
              </Link>
            ) : currentUser ? (
              <button
                onClick={() => followMutation.mutate(profile.isFollowing ? 'unfollow' : 'follow')}
                disabled={followMutation.isPending}
                className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                  profile.isFollowing
                    ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {followMutation.isPending ? '...' : profile.isFollowing ? '取消追蹤' : '追蹤'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Tab */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {([['posts', '發文紀錄'], ['replies', '回覆紀錄'], ['following', '追蹤中']] as const).map(([key, label]) => (
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
                    <div className="text-xs text-gray-400">Lv.{u.level} {LEVEL_NAMES[u.level]}</div>
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
