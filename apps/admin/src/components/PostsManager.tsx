'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Button,
  Popconfirm,
  message,
  Drawer,
  TreeSelect,
  Tag,
  Segmented,
  Input,
  Space,
  Badge,
  Dropdown,
  Typography,
  Tooltip,
} from 'antd';
import {
  DeleteOutlined,
  EyeOutlined,
  EditOutlined,
  CheckCircleOutlined,
  SaveOutlined,
  PushpinOutlined,
  NotificationOutlined,
  LockOutlined,
  MoreOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import {
  EditorProvider,
  Editor,
  Toolbar,
  BtnBold,
  BtnItalic,
  BtnUnderline,
  BtnStrikeThrough,
  BtnBulletList,
  BtnNumberedList,
  BtnLink,
  BtnClearFormatting,
  BtnUndo,
  BtnRedo,
  HtmlButton,
  Separator,
} from 'react-simple-wysiwyg';

import { adminApiFetch } from '@/lib/api';
import { useAdminAuth } from '@/context/auth';

type PostStatus = 'DRAFT' | 'PUBLISHED';
type PostSection = 'NEWS' | 'FEATURED' | 'DISCUSSION';

/** 板塊分區的顯示資訊（前台由上而下：最新新聞 → 站方公告 → 玩家討論） */
const SECTION_META: Record<PostSection, { label: string; color: string; badge: string }> = {
  NEWS: { label: '最新新聞', color: '#1677ff', badge: '📰' },
  FEATURED: { label: '站方公告', color: '#fa541c', badge: '📣' },
  DISCUSSION: { label: '玩家討論', color: '#8c8c8c', badge: '💬' },
};
const SECTION_ORDER: PostSection[] = ['NEWS', 'FEATURED', 'DISCUSSION'];

/** 兩種模式：user＝文章管理（使用者/手動文章）、news＝新聞審核（agent 自動發文） */
type Variant = 'user' | 'news';
const VARIANT_CONFIG: Record<
  Variant,
  {
    autoPosted: 'true' | 'false';
    title: string;
    defaultStatus: StatusFilter;
    draftWord: string;
    emptyDraft: string;
    allDoneText: string;
  }
> = {
  user: {
    autoPosted: 'false',
    title: '文章管理',
    defaultStatus: 'ALL',
    draftWord: '草稿',
    emptyDraft: '目前沒有待審草稿',
    allDoneText: '目前沒有待處理的草稿',
  },
  news: {
    autoPosted: 'true',
    title: '新聞審核',
    defaultStatus: 'DRAFT',
    draftWord: '新聞草稿',
    emptyDraft: '目前沒有待審新聞，等 agent 產出新文章',
    allDoneText: '所有新聞 agent 草稿都已審完',
  },
};

interface PostItem {
  id: string;
  title: string;
  content: string;
  status: PostStatus;
  section: PostSection;
  isPinned: boolean;
  isLocked: boolean;
  isAutoPosted: boolean;
  pinnedUntil: string | null;
  viewCount: number;
  replyCount: number;
  pushCount: number;
  createdAt: string;
  author: { id: string; nickname: string };
  board: {
    id: string;
    name: string;
    category?: { id: string; name: string };
  };
}

interface PostsResponse {
  data: { items: PostItem[]; total: number; page: number; limit: number };
}

interface BoardItem {
  id: string;
  name: string;
  categoryId: string;
  category: { id: string; name: string };
}

interface BoardsResponse {
  data: BoardItem[];
}

type ScopeValue = string | undefined;
type StatusFilter = 'ALL' | PostStatus;

// 從外部網站貼進編輯器時，清掉不必要的 inline style / class / 廣告連結
// 後端 SanitizeRichHtml 已做最終把關，這層只是 UX 改善（編輯時看到的就是乾淨的）
const ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'EM', 'U', 'S', 'DEL', 'B', 'I',
  'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE',
  'A', 'IMG', 'HR', 'SPAN', 'DIV',
]);
const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'target', 'rel']);

function sanitizePastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Element) => {
    // 不在白名單的 tag → 用 span 取代（保留內文）
    if (!ALLOWED_TAGS.has(node.tagName)) {
      const replacement = doc.createElement('span');
      replacement.innerHTML = node.innerHTML;
      node.replaceWith(replacement);
      return;
    }
    // 移除非白名單屬性（含 class / style / data-* / id 等）
    Array.from(node.attributes).forEach((attr) => {
      if (!ALLOWED_ATTRS.has(attr.name.toLowerCase())) {
        node.removeAttribute(attr.name);
      }
    });
    // 連結強制加 rel="noopener noreferrer"
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('rel', 'noopener noreferrer');
      node.setAttribute('target', '_blank');
    }
    Array.from(node.children).forEach((child) => walk(child as Element));
  };
  Array.from(doc.body.children).forEach((child) => walk(child as Element));
  return doc.body.innerHTML;
}

function handleEditorPaste(e: React.ClipboardEvent<HTMLDivElement>) {
  const html = e.clipboardData.getData('text/html');
  if (!html) return; // 純文字直接讓瀏覽器處理
  e.preventDefault();
  const cleaned = sanitizePastedHtml(html);
  // execCommand 仍是 contentEditable 場景下最相容的 insertHTML 做法
  document.execCommand('insertHTML', false, cleaned);
}

// 將相對時間轉成人話（審稿時看「3 分鐘前」比看日期直覺）
function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return '剛剛';
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小時前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return date.toLocaleDateString('zh-TW');
}

export function PostsManager({ variant }: { variant: Variant }) {
  const cfg = VARIANT_CONFIG[variant];
  const queryClient = useQueryClient();
  const { user } = useAdminAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState<ScopeValue>(undefined);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(cfg.defaultStatus);

  // 預覽 / 編輯狀態
  const [selectedPost, setSelectedPost] = useState<PostItem | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  // 開啟 drawer 時，DRAFT 預設進入編輯模式；PUBLISHED 預設預覽
  useEffect(() => {
    if (selectedPost) {
      setEditTitle(selectedPost.title);
      setEditContent(selectedPost.content);
      setEditMode(selectedPost.status === 'DRAFT');
    } else {
      setEditMode(false);
    }
  }, [selectedPost]);

  const { data: boardsData } = useQuery({
    queryKey: ['admin-boards-for-posts'],
    queryFn: () => adminApiFetch<BoardsResponse>('/admin/boards'),
    staleTime: 5 * 60 * 1000,
  });

  const treeData = useMemo(() => {
    const boards = boardsData?.data ?? [];
    const groups = new Map<string, { id: string; name: string; boards: BoardItem[] }>();
    for (const b of boards) {
      const catId = b.category?.id ?? b.categoryId;
      const catName = b.category?.name ?? '未分類';
      if (!groups.has(catId)) groups.set(catId, { id: catId, name: catName, boards: [] });
      groups.get(catId)!.boards.push(b);
    }
    return Array.from(groups.values()).map((g) => ({
      title: g.name,
      value: `cat:${g.id}`,
      key: `cat:${g.id}`,
      selectable: true,
      children: g.boards.map((b) => ({
        title: b.name,
        value: `board:${b.id}`,
        key: `board:${b.id}`,
      })),
    }));
  }, [boardsData]);

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', '20');
  queryParams.set('isAutoPosted', cfg.autoPosted); // 新聞 / 使用者文章分流
  if (search) queryParams.set('q', search);
  if (scope?.startsWith('board:')) queryParams.set('boardId', scope.slice(6));
  else if (scope?.startsWith('cat:')) queryParams.set('categoryId', scope.slice(4));
  if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-posts', variant, page, search, scope, statusFilter],
    queryFn: () => adminApiFetch<PostsResponse>(`/admin/posts?${queryParams}`),
  });

  // 給草稿列表用：抓 DRAFT 總數，當作 badge 顯示（依 variant 分流）
  const { data: draftCountData } = useQuery({
    queryKey: ['admin-posts-draft-count', variant],
    queryFn: () =>
      adminApiFetch<PostsResponse>(
        `/admin/posts?status=DRAFT&isAutoPosted=${cfg.autoPosted}&page=1&limit=1`,
      ),
    refetchInterval: 60_000,
  });
  const draftCount = draftCountData?.data.total ?? 0;

  const toggleMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Record<string, boolean | PostSection>;
    }) =>
      adminApiFetch(`/admin/posts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { title?: string; content?: string; status?: PostStatus };
    }) =>
      adminApiFetch(`/admin/posts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (_, variables) => {
      message.success(
        variables.body.status === 'PUBLISHED' ? '已發布' : '已儲存',
      );
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-posts-draft-count'] });
      setSelectedPost(null);
    },
    onError: (err: Error) => message.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      adminApiFetch(`/admin/posts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('刪除成功');
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-posts-draft-count'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 一鍵刪除：把目前篩選結果（限定 status=DRAFT 才能用）整批刪掉。
  // 帶 isAutoPosted 限定範圍，避免在新聞審核頁誤刪使用者草稿（反之亦然）。
  // 後端會再驗一次 status + 限定 SUPER_ADMIN，前端只是 UX gate。
  const bulkDeleteMutation = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams();
      params.set('status', 'DRAFT');
      params.set('isAutoPosted', cfg.autoPosted);
      if (search) params.set('q', search);
      if (scope?.startsWith('board:')) params.set('boardId', scope.slice(6));
      else if (scope?.startsWith('cat:')) params.set('categoryId', scope.slice(4));
      return adminApiFetch<{ data: { count: number } }>(
        `/admin/posts?${params}`,
        { method: 'DELETE' },
      );
    },
    onSuccess: (res) => {
      message.success(`已刪除 ${res.data.count} 篇草稿`);
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-posts-draft-count'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const columns: ColumnsType<PostItem> = [
    {
      title: '文章',
      key: 'title',
      render: (_, record) => {
        const flags: React.ReactNode[] = [];
        if (record.isAutoPosted) {
          const pinnedUntilTip = record.pinnedUntil
            ? `置頂到 ${new Date(record.pinnedUntil).toLocaleString('zh-TW', { hour12: false })} 自動退置頂`
            : '新聞 Agent 自動發文：發布後 24h 內無人回覆會自動退回草稿';
          flags.push(
            <Tooltip key="a" title={pinnedUntilTip}>
              <Tag color="purple" style={{ marginInlineEnd: 0 }}>
                🤖 自動發文
              </Tag>
            </Tooltip>,
          );
        }
        if (record.isPinned)
          flags.push(
            <Tooltip key="p" title="置頂">
              <PushpinOutlined style={{ color: '#fa8c16' }} />
            </Tooltip>,
          );
        if (record.section === 'NEWS' || record.section === 'FEATURED')
          flags.push(
            <Tooltip key="s" title={`${SECTION_META[record.section].label}（板塊頁置頂區）`}>
              <Tag color={record.section === 'NEWS' ? 'blue' : 'volcano'} style={{ marginInlineEnd: 0 }}>
                {SECTION_META[record.section].badge} {SECTION_META[record.section].label}
              </Tag>
            </Tooltip>,
          );
        if (record.isLocked)
          flags.push(
            <Tooltip key="l" title="鎖定">
              <LockOutlined style={{ color: '#999' }} />
            </Tooltip>,
          );

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {record.status === 'DRAFT' ? (
                <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                  草稿
                </Tag>
              ) : (
                <Tag color="green" style={{ marginInlineEnd: 0 }}>
                  已發布
                </Tag>
              )}
              <Typography.Text
                strong
                style={{ fontSize: 14 }}
                ellipsis={{ tooltip: record.title }}
              >
                {record.title}
              </Typography.Text>
              {flags.length > 0 && (
                <span style={{ display: 'inline-flex', gap: 6, marginLeft: 4 }}>
                  {flags}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#8c8c8c', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span>{record.author.nickname}</span>
              <span style={{ color: '#d9d9d9' }}>·</span>
              {record.board.category && (
                <>
                  <span>{record.board.category.name} / {record.board.name}</span>
                  <span style={{ color: '#d9d9d9' }}>·</span>
                </>
              )}
              <Tooltip title={new Date(record.createdAt).toLocaleString('zh-TW')}>
                <span>{formatRelativeTime(record.createdAt)}</span>
              </Tooltip>
              {record.status === 'PUBLISHED' && (
                <>
                  <span style={{ color: '#d9d9d9' }}>·</span>
                  <span>
                    瀏覽 {record.viewCount} · 回 {record.replyCount} · 推 {record.pushCount}
                  </span>
                </>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      align: 'right' as const,
      render: (_, record) => (
        <Space size={4}>
          <Button
            size="small"
            type={record.status === 'DRAFT' ? 'primary' : 'default'}
            icon={record.status === 'DRAFT' ? <EditOutlined /> : <EyeOutlined />}
            onClick={() => setSelectedPost(record)}
          >
            {record.status === 'DRAFT' ? '審稿' : '檢視'}
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'pin',
                  label: record.isPinned ? '取消置頂' : '置頂',
                  icon: <PushpinOutlined />,
                  onClick: () =>
                    toggleMutation.mutate({
                      id: record.id,
                      body: { isPinned: !record.isPinned },
                    }),
                },
                {
                  key: 'section',
                  label: '移動分區',
                  icon: <NotificationOutlined />,
                  children: SECTION_ORDER.map((s) => ({
                    key: `section-${s}`,
                    label: `${SECTION_META[s].badge} ${SECTION_META[s].label}${record.section === s ? '（目前）' : ''}`,
                    disabled: record.section === s,
                    onClick: () =>
                      toggleMutation.mutate({
                        id: record.id,
                        body: { section: s },
                      }),
                  })),
                },
                {
                  key: 'lock',
                  label: record.isLocked ? '解除鎖定' : '鎖定回覆',
                  icon: <LockOutlined />,
                  onClick: () =>
                    toggleMutation.mutate({
                      id: record.id,
                      body: { isLocked: !record.isLocked },
                    }),
                },
                {
                  key: 'autoPosted',
                  label: record.isAutoPosted
                    ? '取消自動發文標記'
                    : '標為自動發文',
                  icon: <span style={{ display: 'inline-block', width: 14 }}>🤖</span>,
                  onClick: () =>
                    toggleMutation.mutate({
                      id: record.id,
                      body: { isAutoPosted: !record.isAutoPosted },
                    }),
                },
                { type: 'divider' as const },
                {
                  key: 'delete',
                  danger: true,
                  label: (
                    <Popconfirm
                      title={
                        record.status === 'DRAFT'
                          ? '確定要刪除此草稿？'
                          : '確定要刪除此文章？'
                      }
                      onConfirm={() => deleteMutation.mutate(record.id)}
                    >
                      <span style={{ display: 'block' }}>刪除</span>
                    </Popconfirm>
                  ),
                  icon: <DeleteOutlined />,
                },
              ],
            }}
            trigger={['click']}
          >
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* 頁首：標題 + 草稿提醒 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0, lineHeight: 1.4 }}>
            {cfg.title}
          </h2>
          <div style={{ marginTop: 6, fontSize: 13, color: '#8c8c8c' }}>
            {draftCount > 0 ? (
              <>
                <Badge status="warning" />
                目前有 <b style={{ color: '#fa8c16' }}>{draftCount}</b> 篇{cfg.draftWord}等待審稿
              </>
            ) : (
              <>
                <Badge status="success" />
                {cfg.allDoneText}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 工具列 */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 16,
          padding: 12,
          background: '#fafafa',
          borderRadius: 8,
          border: '1px solid #f0f0f0',
        }}
      >
        <Segmented<StatusFilter>
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={[
            {
              label: (
                <span>
                  待審稿
                  {draftCount > 0 && (
                    <Badge
                      count={draftCount}
                      size="small"
                      style={{
                        marginLeft: 6,
                        backgroundColor: '#fa8c16',
                      }}
                    />
                  )}
                </span>
              ),
              value: 'DRAFT',
            },
            { label: '已發布', value: 'PUBLISHED' },
            { label: '全部', value: 'ALL' },
          ]}
        />
        <TreeSelect
          placeholder="全部區塊 / 看板"
          style={{ width: 240 }}
          value={scope}
          onChange={(v) => {
            setScope(v);
            setPage(1);
          }}
          treeData={treeData}
          allowClear
          showSearch
          treeDefaultExpandAll
          treeNodeFilterProp="title"
        />
        <Input.Search
          placeholder="搜尋標題 / 作者"
          style={{ width: 250, maxWidth: '100%' }}
          onSearch={(v) => {
            setSearch(v);
            setPage(1);
          }}
          allowClear
          enterButton
        />
        {/* 一鍵刪除：只在待審稿 tab + 最高管理員 顯示，避免誤刪與越權 */}
        {isSuperAdmin && statusFilter === 'DRAFT' && (data?.data.total ?? 0) > 0 && (
          <Popconfirm
            title={`確定刪除目前列出的全部 ${data?.data.total ?? 0} 篇草稿？`}
            description={
              <div style={{ maxWidth: 280 }}>
                此操作會把目前篩選結果裡的草稿{scope || search ? '（含當前篩選條件）' : ''}
                一次清除，無法復原。建議先確認要保留的文章已經發布。
              </div>
            }
            okText="全部刪除"
            okButtonProps={{ danger: true, loading: bulkDeleteMutation.isPending }}
            cancelText="取消"
            onConfirm={() => bulkDeleteMutation.mutate()}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={bulkDeleteMutation.isPending}
              style={{ marginLeft: 'auto' }}
            >
              一鍵刪除目前草稿
            </Button>
          </Popconfirm>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={data?.data.items}
        rowKey="id"
        loading={isLoading}
        locale={{
          emptyText: (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <FileTextOutlined style={{ fontSize: 32, color: '#d9d9d9' }} />
              <div style={{ marginTop: 12, color: '#8c8c8c' }}>
                {statusFilter === 'DRAFT'
                  ? cfg.emptyDraft
                  : statusFilter === 'PUBLISHED'
                  ? '目前沒有已發布文章'
                  : '沒有符合條件的文章'}
              </div>
            </div>
          ),
        }}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.data.total ?? 0,
          onChange: setPage,
          showTotal: (total) => `共 ${total} 篇`,
          showSizeChanger: false,
        }}
        size="middle"
        rowClassName={(record) =>
          record.status === 'DRAFT' ? 'post-row-draft' : ''
        }
      />

      {/* 給草稿列加微底色，視覺辨識「這需要你處理」 */}
      <style>{`
        .post-row-draft > td {
          background-color: #fff7e6 !important;
        }
        .post-row-draft:hover > td {
          background-color: #ffe7ba !important;
        }
      `}</style>

      {/* 預覽 / 編輯 Drawer */}
      <Drawer
        title={
          <Space>
            {selectedPost?.status === 'DRAFT' ? (
              <Tag color="orange">草稿</Tag>
            ) : (
              <Tag color="green">已發布</Tag>
            )}
            <span>{editMode ? '編輯文章' : '檢視文章'}</span>
          </Space>
        }
        open={!!selectedPost}
        onClose={() => setSelectedPost(null)}
        width={820}
        styles={{ wrapper: { maxWidth: '100vw' }, body: { paddingTop: 16 } }}
        extra={
          selectedPost && !editMode ? (
            <Button icon={<EditOutlined />} onClick={() => setEditMode(true)}>
              編輯
            </Button>
          ) : selectedPost && editMode && selectedPost.status === 'PUBLISHED' ? (
            <Button onClick={() => setEditMode(false)}>取消編輯</Button>
          ) : null
        }
        footer={
          selectedPost && editMode ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                {selectedPost.status === 'DRAFT'
                  ? variant === 'news'
                    ? '審稿完成後按「發布」，會自動上架到該看板的「最新新聞」區'
                    : '審稿完成後按「發布」讓玩家看到'
                  : '已發布文章，修改會立即生效'}
              </div>
              <Space>
                <Button
                  icon={<SaveOutlined />}
                  loading={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({
                      id: selectedPost.id,
                      body: { title: editTitle, content: editContent },
                    })
                  }
                >
                  儲存
                </Button>
                {selectedPost.status === 'DRAFT' && (
                  <Button
                    type="primary"
                    size="large"
                    icon={<CheckCircleOutlined />}
                    loading={updateMutation.isPending}
                    onClick={() =>
                      updateMutation.mutate({
                        id: selectedPost.id,
                        body: {
                          title: editTitle,
                          content: editContent,
                          status: 'PUBLISHED',
                        },
                      })
                    }
                  >
                    儲存並發布
                  </Button>
                )}
                {selectedPost.status === 'PUBLISHED' && (
                  <Popconfirm
                    title="退回為草稿？"
                    description="退回後玩家將看不到這篇文章。"
                    onConfirm={() =>
                      updateMutation.mutate({
                        id: selectedPost.id,
                        body: {
                          title: editTitle,
                          content: editContent,
                          status: 'DRAFT',
                        },
                      })
                    }
                  >
                    <Button danger>退回草稿</Button>
                  </Popconfirm>
                )}
              </Space>
            </div>
          ) : null
        }
      >
        {selectedPost && (
          <div>
            {/* Meta 卡片 */}
            <div
              style={{
                padding: 12,
                background: '#fafafa',
                borderRadius: 8,
                marginBottom: 20,
                fontSize: 13,
                color: '#595959',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '8px 16px',
              }}
            >
              <div>
                <span style={{ color: '#8c8c8c' }}>作者　</span>
                {selectedPost.author.nickname}
              </div>
              <div>
                <span style={{ color: '#8c8c8c' }}>看板　</span>
                {selectedPost.board.category
                  ? `${selectedPost.board.category.name} / `
                  : ''}
                {selectedPost.board.name}
              </div>
              <div>
                <span style={{ color: '#8c8c8c' }}>分區　</span>
                {SECTION_META[selectedPost.section].badge}{' '}
                {SECTION_META[selectedPost.section].label}
              </div>
              <div>
                <span style={{ color: '#8c8c8c' }}>時間　</span>
                {new Date(selectedPost.createdAt).toLocaleString('zh-TW')}
              </div>
              {selectedPost.status === 'PUBLISHED' && (
                <div>
                  <span style={{ color: '#8c8c8c' }}>數據　</span>
                  瀏覽 {selectedPost.viewCount} · 回覆 {selectedPost.replyCount}
                  {' · '}推 {selectedPost.pushCount}
                </div>
              )}
            </div>

            {editMode ? (
              <>
                <div
                  style={{
                    marginBottom: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#262626',
                  }}
                >
                  標題
                </div>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={100}
                  showCount
                  size="large"
                  style={{ marginBottom: 20, fontWeight: 500 }}
                />
                <div
                  style={{
                    marginBottom: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#262626',
                  }}
                >
                  內文
                  <span
                    style={{
                      marginLeft: 8,
                      fontWeight: 400,
                      color: '#8c8c8c',
                      fontSize: 12,
                    }}
                  >
                    所見即所得；點右上「&lt;/&gt;」可切換到 HTML 原始碼編輯
                  </span>
                </div>
                <div className="news-agent-rte">
                  <EditorProvider>
                    <Editor
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onPaste={handleEditorPaste}
                      containerProps={{
                        style: {
                          minHeight: 360,
                          maxHeight: 600,
                          overflowY: 'auto',
                          fontSize: 15,
                          lineHeight: 1.8,
                          background: '#fff',
                          borderRadius: 6,
                        },
                      }}
                    >
                      <Toolbar>
                        <BtnUndo />
                        <BtnRedo />
                        <Separator />
                        <BtnBold />
                        <BtnItalic />
                        <BtnUnderline />
                        <BtnStrikeThrough />
                        <Separator />
                        <BtnBulletList />
                        <BtnNumberedList />
                        <Separator />
                        <BtnLink />
                        <BtnClearFormatting />
                        <Separator />
                        <HtmlButton />
                      </Toolbar>
                    </Editor>
                  </EditorProvider>
                </div>
              </>
            ) : (
              <>
                <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 16 }}>
                  {selectedPost.title}
                </Typography.Title>
                <div
                  style={{
                    lineHeight: 1.85,
                    fontSize: 15,
                    color: '#262626',
                  }}
                  // 預覽以玩家視角呈現：渲染 agent 產出的 HTML
                  // 注意：所有內容皆來自後台 agent 受信任來源，未開放外部使用者直寫
                  dangerouslySetInnerHTML={{ __html: selectedPost.content }}
                />
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
