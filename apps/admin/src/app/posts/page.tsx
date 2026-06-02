'use client';

import { PostsManager } from '@/components/PostsManager';

// 文章管理：只管使用者 / 手動發布的文章（自動新聞在「新聞審核」頁）
export default function PostsPage() {
  return <PostsManager variant="user" />;
}
