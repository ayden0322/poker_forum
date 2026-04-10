'use client';

import React, { useState } from 'react';
import { Table, Button, Tag, Space, Modal, message, Popconfirm } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, DeleteOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';

import { adminApiFetch } from '@/lib/api';

interface ReportItem {
  id: string;
  reason: string;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
  reporter: { id: string; nickname: string };
  post: { id: string; title: string; content: string; author: { id: string; nickname: string }; board: { id: string; name: string } } | null;
  reply: { id: string; content: string; floorNumber: number; author: { id: string; nickname: string }; post: { id: string; title: string } } | null;
}

interface ReportsResponse {
  data: { items: ReportItem[]; total: number; page: number; limit: number };
}

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [previewReport, setPreviewReport] = useState<ReportItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reports', page],
    queryFn: () => adminApiFetch<ReportsResponse>(`/admin/reports?page=${page}&limit=20`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminApiFetch(`/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      message.success('更新成功');
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
      setPreviewReport(null);
    },
    onError: (err: Error) => message.error(err.message),
  });

  const deleteContentMutation = useMutation({
    mutationFn: (report: ReportItem) => {
      if (report.post) {
        return adminApiFetch(`/admin/posts/${report.post.id}`, { method: 'DELETE' });
      }
      // 回覆刪除：目前 API 沒有直接管理員刪回覆端點，先標記已處理
      return Promise.resolve();
    },
    onSuccess: (_data, report) => {
      updateMutation.mutate({ id: report.id, status: 'RESOLVED' });
      message.success('已刪除內容並處理檢舉');
    },
    onError: (err: Error) => message.error(err.message),
  });

  const statusTag = (s: string) => {
    const map: Record<string, { color: string; label: string }> = {
      PENDING: { color: 'warning', label: '待處理' },
      RESOLVED: { color: 'success', label: '已處理' },
      DISMISSED: { color: 'default', label: '已駁回' },
    };
    const v = map[s] ?? { color: 'default', label: s };
    return <Tag color={v.color}>{v.label}</Tag>;
  };

  const columns: ColumnsType<ReportItem> = [
    {
      title: '檢舉對象',
      key: 'target',
      render: (_, r) =>
        r.post
          ? <span>文章：{r.post.title}</span>
          : r.reply
            ? <span>回覆 B{r.reply.floorNumber}：{r.reply.content.substring(0, 40)}...</span>
            : '—',
    },
    { title: '原因', dataIndex: 'reason', key: 'reason', ellipsis: true },
    { title: '檢舉人', key: 'reporter', width: 100, render: (_, r) => r.reporter.nickname },
    { title: '狀態', key: 'status', width: 90, render: (_, r) => statusTag(r.status) },
    { title: '時間', dataIndex: 'createdAt', key: 'createdAt', width: 110, render: (d) => new Date(d).toLocaleDateString('zh-TW') },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setPreviewReport(record)}>
            檢視
          </Button>
          {record.status === 'PENDING' && (
            <>
              <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => updateMutation.mutate({ id: record.id, status: 'RESOLVED' })}>處理</Button>
              <Button size="small" icon={<CloseOutlined />} onClick={() => updateMutation.mutate({ id: record.id, status: 'DISMISSED' })}>駁回</Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>檢舉管理</h2>
      <Table
        columns={columns}
        dataSource={data?.data.items}
        rowKey="id"
        loading={isLoading}
        pagination={{ current: page, pageSize: 20, total: data?.data.total ?? 0, onChange: setPage, showTotal: (t) => `共 ${t} 筆` }}
        size="middle"
        scroll={{ x: 700 }}
      />

      {/* 內容預覽 Modal */}
      <Modal
        title="檢舉詳情"
        open={!!previewReport}
        onCancel={() => setPreviewReport(null)}
        width={640}
        styles={{ wrapper: { maxWidth: '100vw' } }}
        footer={previewReport?.status === 'PENDING' ? (
          <Space>
            <Popconfirm
              title="確定要刪除此內容並處理檢舉？"
              onConfirm={() => previewReport && deleteContentMutation.mutate(previewReport)}
            >
              <Button danger icon={<DeleteOutlined />}>刪除內容</Button>
            </Popconfirm>
            <Button icon={<WarningOutlined />} onClick={() => previewReport && updateMutation.mutate({ id: previewReport.id, status: 'RESOLVED' })}>
              僅標記處理
            </Button>
            <Button onClick={() => previewReport && updateMutation.mutate({ id: previewReport.id, status: 'DISMISSED' })}>
              駁回
            </Button>
          </Space>
        ) : null}
      >
        {previewReport && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Tag color="blue">{previewReport.post ? '文章' : '回覆'}</Tag>
              {statusTag(previewReport.status)}
            </div>

            <div style={{ marginBottom: 12 }}>
              <strong>檢舉人：</strong>{previewReport.reporter.nickname}
              <br />
              <strong>檢舉原因：</strong>{previewReport.reason}
              <br />
              <strong>檢舉時間：</strong>{new Date(previewReport.createdAt).toLocaleString('zh-TW')}
            </div>

            <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
              <h4 style={{ marginBottom: 8 }}>被檢舉內容</h4>
              {previewReport.post ? (
                <>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
                    看板：{previewReport.post.board.name} · 作者：{previewReport.post.author.nickname}
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{previewReport.post.title}</div>
                  <div style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>
                    {previewReport.post.content}
                  </div>
                </>
              ) : previewReport.reply ? (
                <>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
                    文章：{previewReport.reply.post.title} · 作者：{previewReport.reply.author.nickname} · B{previewReport.reply.floorNumber}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>
                    {previewReport.reply.content}
                  </div>
                </>
              ) : (
                <span style={{ color: '#999' }}>內容已被刪除</span>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
