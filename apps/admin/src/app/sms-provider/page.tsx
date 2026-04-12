'use client';

import React, { useEffect } from 'react';
import { Card, Form, Input, Switch, Button, Space, message, Divider, Typography, Tag } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApiFetch } from '@/lib/api';

const { Title, Paragraph, Text } = Typography;

interface SmsProviderConfig {
  id: string;
  providerCode: string;
  displayName: string;
  enabled: boolean;
  apiEndpoint: string;
  apiKeyMasked: string;
  apiSecretMasked: string;
  senderId?: string | null;
  templateId?: string | null;
  extraConfig?: Record<string, unknown> | null;
  updatedAt: string;
}

export default function SmsProviderPage() {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-sms-provider'],
    queryFn: () => adminApiFetch<{ data: SmsProviderConfig[] }>('/admin/sms-provider'),
  });

  const current = data?.data?.find((c) => c.providerCode === 'ta-sms') || data?.data?.[0];

  useEffect(() => {
    if (current) {
      form.setFieldsValue({
        providerCode: current.providerCode,
        displayName: current.displayName,
        enabled: current.enabled,
        apiEndpoint: current.apiEndpoint,
        apiKey: '',
        apiSecret: '',
        senderId: current.senderId || '',
        templateId: current.templateId || '',
        extraConfigJson: current.extraConfig ? JSON.stringify(current.extraConfig, null, 2) : '',
      });
    } else {
      form.setFieldsValue({
        providerCode: 'ta-sms',
        displayName: 'TA 國際簡訊平台',
        enabled: false,
      });
    }
  }, [current, form]);

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => {
      const payload: Record<string, unknown> = { ...values };
      const raw = (values.extraConfigJson as string) || '';
      delete payload.extraConfigJson;
      if (raw.trim()) {
        try {
          payload.extraConfig = JSON.parse(raw);
        } catch {
          throw new Error('額外參數 JSON 格式錯誤');
        }
      }
      if (!payload.apiKey) delete payload.apiKey;
      if (!payload.apiSecret) delete payload.apiSecret;
      return adminApiFetch('/admin/sms-provider', { method: 'PUT', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      message.success('設定已儲存');
      qc.invalidateQueries({ queryKey: ['admin-sms-provider'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const testMutation = useMutation({
    mutationFn: (phone: string) =>
      adminApiFetch<{ data: { success: boolean; error?: string } }>('/admin/sms-provider/test', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }),
    onSuccess: (res) => {
      if (res.data.success) message.success('測試簡訊已發送');
      else message.error(`發送失敗：${res.data.error || '未知錯誤'}`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  const [testPhone, setTestPhone] = React.useState('');

  return (
    <Card loading={isLoading} title={<Title level={4} style={{ margin: 0 }}>簡訊服務商設定</Title>}>
      <Paragraph>
        <Text type="secondary">
          填入 TA 國際簡訊平台的 API 資訊。API Key / Username 會以 AES-256 加密儲存，儲存後只會顯示遮罩，
          若不需更動請留空。
        </Text>
      </Paragraph>

      {current && (
        <Paragraph>
          目前狀態：
          {current.enabled ? <Tag color="green">啟用中</Tag> : <Tag>停用</Tag>}
          <Text type="secondary">（最後更新：{new Date(current.updatedAt).toLocaleString()}）</Text>
        </Paragraph>
      )}

      <Divider />

      <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
        <Form.Item label="服務商代號" name="providerCode" rules={[{ required: true }]}>
          <Input placeholder="ta-sms" />
        </Form.Item>

        <Form.Item label="顯示名稱" name="displayName" rules={[{ required: true }]}>
          <Input />
        </Form.Item>

        <Form.Item label="啟用" name="enabled" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item label="API Endpoint（發送簡訊）" name="apiEndpoint" rules={[{ required: true }]}>
          <Input placeholder="https://域名/ta-sms/openapi/submittal" />
        </Form.Item>

        <Form.Item
          label={
            <span>
              API Key（簽名金鑰）{' '}
              {current?.apiKeyMasked && <Text type="secondary">（目前：{current.apiKeyMasked}）</Text>}
            </span>
          }
          name="apiKey"
        >
          <Input.Password placeholder="留空代表不更動" />
        </Form.Item>

        <Form.Item
          label={
            <span>
              Username（通道編號）{' '}
              {current?.apiSecretMasked && <Text type="secondary">（目前：{current.apiSecretMasked}）</Text>}
            </span>
          }
          name="apiSecret"
        >
          <Input.Password placeholder="留空代表不更動" />
        </Form.Item>

        <Form.Item label="發送 ID（spNumber）" name="senderId">
          <Input placeholder="選填，預設隨機 6 位數字" />
        </Form.Item>

        <Form.Item label="樣板 ID" name="templateId">
          <Input placeholder="選填" />
        </Form.Item>

        <Form.Item
          label="額外參數（JSON 格式）"
          name="extraConfigJson"
          tooltip="如簽名類型等額外參數"
        >
          <Input.TextArea rows={5} placeholder='{"signType": "MD5"}' />
        </Form.Item>

        <Space>
          <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
            儲存設定
          </Button>
        </Space>
      </Form>

      <Divider>測試發送</Divider>

      <Paragraph>
        <Text type="secondary">填入你的手機號碼測試串接是否正常（實際會發送一則簡訊）</Text>
      </Paragraph>
      <Space>
        <Input
          style={{ width: 240 }}
          placeholder="0912345678"
          value={testPhone}
          onChange={(e) => setTestPhone(e.target.value)}
        />
        <Button
          onClick={() => testPhone && testMutation.mutate(testPhone)}
          loading={testMutation.isPending}
        >
          發送測試簡訊
        </Button>
      </Space>
    </Card>
  );
}
