'use client';

import React, { useState, useRef } from 'react';
import {
  Table, Button, Tag, Space, Drawer, Input, Select, message, Avatar,
  Popconfirm, Form, Divider, Image,
} from 'antd';
import {
  PlusOutlined, BugOutlined, BulbOutlined, MessageOutlined,
  DeleteOutlined, UserOutlined, PictureOutlined, LoadingOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { adminApiFetch } from '@/lib/api';

const { TextArea } = Input;

// ===== 圖片上傳工具（FormData 不能用 adminApiFetch，因為不能帶 Content-Type: json） =====
async function uploadImage(file: File): Promise<string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_accessToken') : null;
  if (!token) throw new Error('尚未登入，請重新整理頁面');

  const formData = new FormData();
  formData.append('file', file);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api';
  const res = await fetch(`${apiUrl}/upload/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: '上傳失敗' })) as { message?: string };
    throw new Error(err.message || '上傳失敗');
  }

  const data = await res.json() as { data: { url: string } };
  return data.data.url;
}

// ===== 內容渲染（支援圖片 markdown） =====
function RenderContent({ text }: { text: string }) {
  const parts = text.split(/(!\[.*?\]\(.*?\))/g);
  return (
    <div style={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((part, i) => {
        const match = part.match(/^!\[(.*?)\]\((.*?)\)$/);
        if (match) {
          return (
            <div key={i} style={{ margin: '8px 0' }}>
              <Image
                src={match[2]}
                alt={match[1] || '圖片'}
                style={{ maxWidth: '100%', borderRadius: 4 }}
              />
            </div>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

// ===== 上傳圖片型別 =====
interface UploadedImage {
  url: string;
  name: string;
}

// ===== 圖片上傳按鈕元件 =====
function ImageUploadButton({ onUploaded }: { onUploaded: (img: UploadedImage) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      message.error('只能上傳圖片檔案');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('圖片大小不能超過 5MB');
      return;
    }

    setUploading(true);
    try {
      const url = await uploadImage(file);
      onUploaded({ url, name: file.name });
      message.success('圖片上傳成功');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '上傳失敗');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
      <Button
        size="small"
        icon={uploading ? <LoadingOutlined /> : <PictureOutlined />}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? '上傳中...' : '上傳圖片'}
      </Button>
    </>
  );
}

// ===== 圖片縮圖列表 =====
function ImageThumbnails({ images, onRemove }: { images: UploadedImage[]; onRemove: (index: number) => void }) {
  if (images.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {images.map((img, i) => (
        <div
          key={`${img.url}-${i}`}
          style={{
            position: 'relative',
            width: 80,
            height: 80,
            borderRadius: 6,
            overflow: 'hidden',
            border: '1px solid #d9d9d9',
          }}
        >
          <Image
            src={img.url}
            alt={img.name}
            width={80}
            height={80}
            style={{ objectFit: 'cover' }}
            preview={{ mask: '預覽' }}
          />
          <div
            onClick={() => onRemove(i)}
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              cursor: 'pointer',
              lineHeight: 1,
              zIndex: 1,
            }}
          >
            ✕
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== 型別定義 =====
interface FeedbackItem {
  id: string;
  type: 'BUG' | 'SUGGESTION';
  title: string;
  status: 'PENDING' | 'REVIEWING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
  author: { id: string; nickname: string; avatar: string | null };
  replyCount: number;
}

interface FeedbackDetail {
  id: string;
  type: 'BUG' | 'SUGGESTION';
  title: string;
  content: string;
  status: 'PENDING' | 'REVIEWING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
  author: { id: string; nickname: string; avatar: string | null };
  replies: {
    id: string;
    content: string;
    createdAt: string;
    author: { id: string; nickname: string; avatar: string | null };
  }[];
}

interface ListResponse {
  data: { items: FeedbackItem[]; total: number; page: number; limit: number };
}

interface DetailResponse {
  data: FeedbackDetail;
}

// ===== 常量 =====
const typeMap: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  BUG: { color: 'red', label: '錯誤回報', icon: <BugOutlined /> },
  SUGGESTION: { color: 'blue', label: '功能建議', icon: <BulbOutlined /> },
};

const statusMap: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'default', label: '待處理' },
  REVIEWING: { color: 'processing', label: '審核中' },
  IN_PROGRESS: { color: 'warning', label: '開發中' },
  COMPLETED: { color: 'success', label: '已完成' },
  REJECTED: { color: 'error', label: '不採納' },
};

export default function FeedbacksPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();

  // Drawer 狀態
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [createForm] = Form.useForm();
  const [createImages, setCreateImages] = useState<UploadedImage[]>([]);
  const [replyImages, setReplyImages] = useState<UploadedImage[]>([]);

  // ===== 查詢 =====
  const queryParams = new URLSearchParams({ page: String(page), limit: '20' });
  if (filterType) queryParams.set('type', filterType);
  if (filterStatus) queryParams.set('status', filterStatus);

  const { data: listData, isLoading } = useQuery({
    queryKey: ['admin-feedbacks', page, filterType, filterStatus],
    queryFn: () => adminApiFetch<ListResponse>(`/admin/feedbacks?${queryParams}`),
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['admin-feedback-detail', detailId],
    queryFn: () => adminApiFetch<DetailResponse>(`/admin/feedbacks/${detailId}`),
    enabled: !!detailId,
  });

  // ===== Mutations =====
  const createMutation = useMutation({
    mutationFn: (body: { type: string; title: string; content: string }) =>
      adminApiFetch('/admin/feedbacks', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      message.success('回報已送出');
      queryClient.invalidateQueries({ queryKey: ['admin-feedbacks'] });
      setCreateOpen(false);
      createForm.resetFields();
      setCreateImages([]);
    },
    onError: (err: Error) => message.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminApiFetch(`/admin/feedbacks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      message.success('狀態已更新');
      queryClient.invalidateQueries({ queryKey: ['admin-feedbacks'] });
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-detail', detailId] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      adminApiFetch(`/admin/feedbacks/${id}/replies`, { method: 'POST', body: JSON.stringify({ content }) }),
    onSuccess: () => {
      message.success('回覆已送出');
      setReplyContent('');
      setReplyImages([]);
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-detail', detailId] });
      queryClient.invalidateQueries({ queryKey: ['admin-feedbacks'] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      adminApiFetch(`/admin/feedbacks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('已刪除');
      queryClient.invalidateQueries({ queryKey: ['admin-feedbacks'] });
      setDetailId(null);
    },
    onError: (err: Error) => message.error(err.message),
  });

  // ===== 圖片上傳回呼 =====
  const handleCreateImageUploaded = (img: UploadedImage) => {
    setCreateImages((prev) => [...prev, img]);
  };

  const handleReplyImageUploaded = (img: UploadedImage) => {
    setReplyImages((prev) => [...prev, img]);
  };

  // ===== 提交時組合文字 + 圖片 markdown =====
  const buildContentWithImages = (text: string, images: UploadedImage[]) => {
    if (images.length === 0) return text;
    const imageMarkdown = images.map((img) => `![${img.name}](${img.url})`).join('\n');
    return text + (text ? '\n' : '') + imageMarkdown;
  };

  // ===== 表格欄位 =====
  const columns: ColumnsType<FeedbackItem> = [
    {
      title: '類型', key: 'type', width: 110,
      render: (_, r) => {
        const t = typeMap[r.type];
        return <Tag icon={t.icon} color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: '標題', dataIndex: 'title', key: 'title', ellipsis: true,
      render: (title, r) => (
        <a onClick={() => setDetailId(r.id)} style={{ fontWeight: 500 }}>{title}</a>
      ),
    },
    {
      title: '提交者', key: 'author', width: 120,
      render: (_, r) => (
        <Space size={4}>
          <Avatar src={r.author.avatar} icon={<UserOutlined />} size={20} />
          {r.author.nickname}
        </Space>
      ),
    },
    {
      title: '狀態', key: 'status', width: 100,
      render: (_, r) => {
        const s = statusMap[r.status];
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '回覆', key: 'replyCount', width: 70, align: 'center',
      render: (_, r) => r.replyCount > 0 ? <Tag><MessageOutlined /> {r.replyCount}</Tag> : '—',
    },
    {
      title: '建立時間', dataIndex: 'createdAt', key: 'createdAt', width: 110,
      render: (d) => new Date(d).toLocaleDateString('zh-TW'),
    },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => setDetailId(r.id)}>查看</Button>
          <Popconfirm title="確定要刪除此回報？" onConfirm={() => deleteMutation.mutate(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const detail = detailData?.data;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 'bold', margin: 0 }}>意見回報</h2>
        <Space>
          <Select
            placeholder="類型篩選"
            allowClear
            style={{ width: 130, maxWidth: '100%' }}
            value={filterType}
            onChange={(v) => { setFilterType(v); setPage(1); }}
            options={[
              { value: 'BUG', label: '錯誤回報' },
              { value: 'SUGGESTION', label: '功能建議' },
            ]}
          />
          <Select
            placeholder="狀態篩選"
            allowClear
            style={{ width: 130, maxWidth: '100%' }}
            value={filterStatus}
            onChange={(v) => { setFilterStatus(v); setPage(1); }}
            options={[
              { value: 'PENDING', label: '待處理' },
              { value: 'REVIEWING', label: '審核中' },
              { value: 'IN_PROGRESS', label: '開發中' },
              { value: 'COMPLETED', label: '已完成' },
              { value: 'REJECTED', label: '不採納' },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新增回報
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={listData?.data.items}
        rowKey="id"
        loading={isLoading}
        pagination={{
          current: page, pageSize: 20, total: listData?.data.total ?? 0,
          onChange: setPage, showTotal: (t) => `共 ${t} 筆`,
        }}
        size="middle"
        scroll={{ x: 800 }}
      />

      {/* 新增回報 Drawer */}
      <Drawer
        title="新增回報"
        open={createOpen}
        onClose={() => { setCreateOpen(false); setCreateImages([]); }}
        width={480}
        styles={{ wrapper: { maxWidth: '100vw' } }}
        extra={
          <Button type="primary" loading={createMutation.isPending} onClick={() => createForm.submit()}>
            送出
          </Button>
        }
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(values) => createMutation.mutate({
            ...values,
            content: buildContentWithImages(values.content, createImages),
          })}
          initialValues={{ type: 'BUG' }}
        >
          <Form.Item name="type" label="類型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'BUG', label: '錯誤回報' },
                { value: 'SUGGESTION', label: '功能建議' },
              ]}
            />
          </Form.Item>
          <Form.Item name="title" label="標題" rules={[{ required: true, message: '請輸入標題' }]}>
            <Input placeholder="簡述問題或建議" />
          </Form.Item>
          <Form.Item name="content" label="詳細說明" rules={[{ required: true, message: '請輸入說明' }]}>
            <TextArea rows={6} placeholder="請詳細描述問題發生的步驟、預期行為，或建議的功能內容" />
          </Form.Item>
          <Form.Item>
            <ImageUploadButton onUploaded={handleCreateImageUploaded} />
            <span style={{ marginLeft: 8, fontSize: 12, color: '#999' }}>
              支援 JPG、PNG、WebP、GIF，最大 5MB
            </span>
            <ImageThumbnails
              images={createImages}
              onRemove={(i) => setCreateImages((prev) => prev.filter((_, idx) => idx !== i))}
            />
          </Form.Item>
        </Form>
      </Drawer>

      {/* 詳情 Drawer */}
      <Drawer
        title={detail ? detail.title : '載入中...'}
        open={!!detailId}
        onClose={() => { setDetailId(null); setReplyContent(''); setReplyImages([]); }}
        width={560}
        styles={{ wrapper: { maxWidth: '100vw' } }}
        loading={detailLoading}
      >
        {detail && (
          <div>
            {/* 基本資訊 */}
            <div style={{ marginBottom: 16 }}>
              <Space>
                <Tag icon={typeMap[detail.type].icon} color={typeMap[detail.type].color}>
                  {typeMap[detail.type].label}
                </Tag>
                <Tag color={statusMap[detail.status].color}>
                  {statusMap[detail.status].label}
                </Tag>
              </Space>
            </div>

            <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
              <Space size={4}>
                <Avatar src={detail.author.avatar} icon={<UserOutlined />} size={18} />
                {detail.author.nickname}
              </Space>
              <span style={{ marginLeft: 12 }}>
                {new Date(detail.createdAt).toLocaleString('zh-TW')}
              </span>
            </div>

            {/* 內容（支援圖片渲染） */}
            <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <RenderContent text={detail.content} />
            </div>

            {/* 狀態更新 */}
            <div style={{ marginBottom: 16 }}>
              <span style={{ marginRight: 8, fontWeight: 500 }}>更新狀態：</span>
              <Select
                value={detail.status}
                style={{ width: 140 }}
                onChange={(status) => statusMutation.mutate({ id: detail.id, status })}
                loading={statusMutation.isPending}
                options={[
                  { value: 'PENDING', label: '待處理' },
                  { value: 'REVIEWING', label: '審核中' },
                  { value: 'IN_PROGRESS', label: '開發中' },
                  { value: 'COMPLETED', label: '已完成' },
                  { value: 'REJECTED', label: '不採納' },
                ]}
              />
            </div>

            <Divider>回覆 ({detail.replies.length})</Divider>

            {/* 回覆列表 */}
            <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
              {detail.replies.length === 0 ? (
                <div style={{ color: '#999', textAlign: 'center', padding: 24 }}>尚無回覆</div>
              ) : (
                detail.replies.map((reply) => (
                  <div key={reply.id} style={{ marginBottom: 12, padding: 12, background: '#fafafa', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                      <Avatar src={reply.author.avatar} icon={<UserOutlined />} size={22} />
                      <span style={{ marginLeft: 8, fontWeight: 500, fontSize: 13 }}>{reply.author.nickname}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: '#999' }}>
                        {new Date(reply.createdAt).toLocaleString('zh-TW')}
                      </span>
                    </div>
                    <RenderContent text={reply.content} />
                  </div>
                ))
              )}
            </div>

            {/* 回覆輸入 */}
            <div>
              <TextArea
                rows={3}
                placeholder="輸入回覆..."
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
              />
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImageUploadButton onUploaded={handleReplyImageUploaded} />
                <Button
                  type="primary"
                  style={{ marginLeft: 'auto' }}
                  disabled={!replyContent.trim() && replyImages.length === 0}
                  loading={replyMutation.isPending}
                  onClick={() => replyMutation.mutate({
                    id: detail.id,
                    content: buildContentWithImages(replyContent.trim(), replyImages),
                  })}
                >
                  送出回覆
                </Button>
              </div>
              <ImageThumbnails
                images={replyImages}
                onRemove={(i) => setReplyImages((prev) => prev.filter((_, idx) => idx !== i))}
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
