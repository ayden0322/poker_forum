// ===== API Response =====
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ===== Auth =====
export interface LoginRequest {
  account: string;
  password: string;
}

export interface RegisterRequest {
  nickname: string;
  account: string;
  password: string;
  confirmPassword: string;
  email?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  nickname: string;
  role: string;
  iat?: number;
  exp?: number;
}

// ===== User =====
export interface UserProfile {
  id: string;
  nickname: string;
  avatar: string | null;
  level: number;
  role: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  createdAt: string;
}

// ===== Post =====
export interface PostListItem {
  id: string;
  title: string;
  boardSlug: string;
  boardName: string;
  author: {
    id: string;
    nickname: string;
    avatar: string | null;
  };
  replyCount: number;
  pushCount: number;
  viewCount: number;
  isPinned: boolean;
  isLocked: boolean;
  lastReplyAt: string | null;
  lastReplyBy: string | null;
  createdAt: string;
}

export interface PostDetail extends PostListItem {
  content: string;
  tags: string[];
  isBookmarked?: boolean;
  isPushed?: boolean;
}

export interface CreatePostRequest {
  boardId: string;
  title: string;
  content: string;
  tags?: string[];
}

// ===== Reply =====
export interface ReplyItem {
  id: string;
  floorNumber: number;
  content: string;
  author: {
    id: string;
    nickname: string;
    avatar: string | null;
    level: number;
  };
  quotedReply?: {
    id: string;
    floorNumber: number;
    content: string;
    authorNickname: string;
    createdAt: string;
  } | null;
  pushCount: number;
  isPushed?: boolean;
  createdAt: string;
}

export interface CreateReplyRequest {
  content: string;
  quotedReplyId?: string;
}

// ===== Board =====
export interface BoardItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  postCount: number;
  categoryId: string;
  categoryName: string;
}

export interface CategoryWithBoards {
  id: string;
  name: string;
  slug: string;
  boards: BoardItem[];
}

// ===== Notification =====
export interface NotificationItem {
  id: string;
  type: string;
  content: string;
  sourceUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

// ===== Query Params =====
export interface PostQueryParams {
  boardSlug?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'latest' | 'lastReply';
  search?: string;
  tag?: string;
}
