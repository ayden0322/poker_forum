'use client';

import { PostsManager } from '@/components/PostsManager';

// 新聞審核：只管新聞 agent 自動發文，審核通過後自動落該看板「最新新聞」區
export default function NewsReviewPage() {
  return <PostsManager variant="news" />;
}
