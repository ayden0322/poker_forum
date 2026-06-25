'use client';

import React, { useMemo, useState } from 'react';
import {
  Drawer,
  Checkbox,
  Switch,
  Button,
  Select,
  Divider,
  Space,
  Tag,
  Spin,
  Empty,
  Popconfirm,
  message,
  Typography,
} from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApiFetch } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/roles';

interface CatalogItem {
  permKey: string;
  label: string;
  group?: string;
}
interface PermResponse {
  data: {
    target: { id: string; nickname: string; role: string };
    catalog: { pages: CatalogItem[]; caps: CatalogItem[] };
    granted: string[];
    grantable: string[];
  };
}

interface Props {
  targetId: string | null;
  targetNickname?: string;
  /** 其他可作為「複製來源」的管理員（不含目標本人） */
  copySources: { id: string; nickname: string; role: string }[];
  onClose: () => void;
}

export function AdminPermissionDrawer({ targetId, targetNickname, copySources, onClose }: Props) {
  const queryClient = useQueryClient();
  const open = !!targetId;

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [copyFrom, setCopyFrom] = useState<string | undefined>(undefined);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-permissions', targetId],
    queryFn: () => adminApiFetch<PermResponse>(`/admin/admins/${targetId}/permissions`),
    enabled: open,
  });

  // 載入後初始化勾選狀態
  React.useEffect(() => {
    if (data) setChecked(new Set(data.data.granted));
  }, [data]);

  const grantable = useMemo(() => new Set(data?.data.grantable ?? []), [data]);

  const toggle = (permKey: string, on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(permKey);
      else next.delete(permKey);
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      adminApiFetch(`/admin/admins/${targetId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permKeys: [...checked] }),
      }),
    onSuccess: () => {
      message.success('權限已更新');
      queryClient.invalidateQueries({ queryKey: ['admin-permissions', targetId] });
      onClose();
    },
    onError: (err: Error) => message.error(err.message),
  });

  const copyMutation = useMutation({
    mutationFn: (sourceId: string) =>
      adminApiFetch(`/admin/admins/${targetId}/permissions/copy-from/${sourceId}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      message.success('已複製來源帳號的權限');
      setCopyFrom(undefined);
      queryClient.invalidateQueries({ queryKey: ['admin-permissions', targetId] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 能力依 group 分組顯示
  const capsByGroup = useMemo(() => {
    const groups: Record<string, CatalogItem[]> = {};
    for (const c of data?.data.catalog.caps ?? []) {
      (groups[c.group ?? '其他'] ??= []).push(c);
    }
    return groups;
  }, [data]);

  const renderItem = (item: CatalogItem, kind: 'page' | 'cap') => {
    const can = grantable.has(item.permKey);
    const on = checked.has(item.permKey);
    const control =
      kind === 'page' ? (
        <Checkbox
          checked={on}
          disabled={!can}
          onChange={(e) => toggle(item.permKey, e.target.checked)}
        >
          {item.label}
        </Checkbox>
      ) : (
        <Space>
          <Switch
            size="small"
            checked={on}
            disabled={!can}
            onChange={(v) => toggle(item.permKey, v)}
          />
          <span style={{ color: can ? undefined : '#bbb' }}>{item.label}</span>
        </Space>
      );
    return (
      <div key={item.permKey} style={{ padding: '4px 0' }}>
        {control}
        {!can && (
          <Tag color="default" style={{ marginLeft: 8, fontSize: 11 }}>
            你無此權限，無法授予
          </Tag>
        )}
      </div>
    );
  };

  return (
    <Drawer
      title={
        <Space>
          <span>設定權限</span>
          {data && (
            <>
              <strong>{data.data.target.nickname}</strong>
              <Tag>{ROLE_LABEL[data.data.target.role] ?? data.data.target.role}</Tag>
            </>
          )}
          {!data && targetNickname && <strong>{targetNickname}</strong>}
        </Space>
      }
      width={520}
      open={open}
      onClose={onClose}
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={saveMutation.isPending}
            // refetch / 複製進行中禁用，避免用舊的 checked 狀態覆蓋剛複製/重載的權限
            disabled={isLoading || !data || isFetching || copyMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            儲存
          </Button>
        </div>
      }
    >
      {isLoading || !data ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : (
        <Spin spinning={isFetching && !isLoading}>
          {/* 快速複製：把另一個管理員的整套權限套到此帳號 */}
          <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <Typography.Text strong>從其他管理員複製權限</Typography.Text>
            <div style={{ fontSize: 12, color: '#999', margin: '4px 0 8px' }}>
              先選好一個設定完整的帳號，整套權限會覆蓋到「{data.data.target.nickname}」（仍受你可授予範圍限制）。
            </div>
            <Space.Compact style={{ width: '100%' }}>
              <Select
                style={{ flex: 1 }}
                placeholder="選擇來源管理員"
                value={copyFrom}
                onChange={setCopyFrom}
                showSearch
                optionFilterProp="label"
                options={copySources.map((s) => ({
                  value: s.id,
                  label: `${s.nickname}（${ROLE_LABEL[s.role] ?? s.role}）`,
                }))}
                notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="無其他可複製的管理員" />}
              />
              <Popconfirm
                title={`複製權限到「${data.data.target.nickname}」？`}
                description="此動作會覆蓋目標帳號目前的權限。"
                disabled={!copyFrom}
                onConfirm={() => copyFrom && copyMutation.mutate(copyFrom)}
              >
                <Button type="default" loading={copyMutation.isPending} disabled={!copyFrom}>
                  複製
                </Button>
              </Popconfirm>
            </Space.Compact>
          </div>

          <Divider orientation="left" style={{ margin: '8px 0' }}>
            頁面存取
          </Divider>
          {data.data.catalog.pages.map((p) => renderItem(p, 'page'))}

          <Divider orientation="left" style={{ margin: '16px 0 8px' }}>
            敏感能力
          </Divider>
          {Object.entries(capsByGroup).map(([group, items]) => (
            <div key={group} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#888', margin: '4px 0' }}>{group}</div>
              {items.map((c) => renderItem(c, 'cap'))}
            </div>
          ))}
        </Spin>
      )}
    </Drawer>
  );
}
