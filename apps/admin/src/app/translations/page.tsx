'use client';

import React, { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  Tag,
  Statistic,
  Row,
  Col,
  Alert,
  Divider,
  message,
  Descriptions,
  Progress,
  InputNumber,
} from 'antd';
import {
  ThunderboltOutlined,
  DollarOutlined,
  TranslationOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { adminApiFetch } from '@/lib/api';

const { Title, Text, Paragraph } = Typography;

interface SeedResult {
  teamsTranslated: number;
  teamIdsMapped: number;
  playersTranslated: number;
  errors: string[];
  monthlyCost: {
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    callCount: number;
  };
}

interface UsageResponse {
  data: {
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    callCount: number;
  };
}

export default function TranslationsPage() {
  const [season, setSeason] = useState<number>(new Date().getFullYear());

  // 本月使用量
  const { data: usage, refetch: refetchUsage } = useQuery({
    queryKey: ['translation-usage'],
    queryFn: () => adminApiFetch<UsageResponse>('/admin/translations/usage'),
    staleTime: 60 * 1000,
  });

  // MLB 一鍵 Seed
  const mlbSeedMutation = useMutation({
    mutationFn: () =>
      adminApiFetch<{ success: boolean; data: SeedResult }>('/admin/mlb-seed/all', {
        method: 'POST',
        body: JSON.stringify({ season }),
      }),
    onSuccess: (res) => {
      if (res.success) {
        message.success(
          `完成！球隊 ${res.data.teamsTranslated} / ID 對應 ${res.data.teamIdsMapped} / 球員 ${res.data.playersTranslated}`,
        );
        refetchUsage();
      } else {
        message.error('Seed 失敗，請查看日誌');
      }
    },
    onError: (e: Error) => message.error(`失敗：${e.message}`),
  });

  const currentUsage = usage?.data;

  return (
    <div style={{ maxWidth: 1000 }}>
      <Title level={3}>翻譯管理</Title>
      <Paragraph type="secondary">
        管理 API-Sports 和 MLB 官方 API 資料的中文翻譯（台灣用語）。使用 Claude Haiku 4.5 AI 自動翻譯，結果存入資料庫後不再重複呼叫。
      </Paragraph>

      {/* 本月使用量 */}
      <Card title="Claude AI 使用量" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="本月花費"
              value={currentUsage?.totalCostUsd ?? 0}
              precision={4}
              prefix="$"
              suffix="USD"
              valueStyle={{ color: (currentUsage?.totalCostUsd ?? 0) > 10 ? '#ff4d4f' : '#3f8600' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              約 NT${Math.ceil((currentUsage?.totalCostUsd ?? 0) * 32)}
            </Text>
          </Col>
          <Col span={6}>
            <Statistic title="Input Tokens" value={currentUsage?.totalInputTokens ?? 0} />
          </Col>
          <Col span={6}>
            <Statistic title="Output Tokens" value={currentUsage?.totalOutputTokens ?? 0} />
          </Col>
          <Col span={6}>
            <Statistic title="呼叫次數" value={currentUsage?.callCount ?? 0} />
          </Col>
        </Row>
        <Divider style={{ margin: '16px 0' }} />
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetchUsage()}>
            刷新
          </Button>
          <Text type="secondary" style={{ fontSize: 12 }}>
            翻譯成本：Input $1 / M tokens，Output $5 / M tokens
          </Text>
        </Space>
      </Card>

      {/* MLB 一鍵翻譯 */}
      <Card
        title={
          <Space>
            <TranslationOutlined />
            <span>MLB 一鍵翻譯</span>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Alert
          message="什麼時候需要執行？"
          description={
            <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
              <li>首次部署後（正式環境）</li>
              <li>新球季開始時（有新球員加入）</li>
              <li>球隊交易後想立刻更新翻譯時</li>
            </ul>
          }
          type="info"
          style={{ marginBottom: 16 }}
        />

        <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="執行步驟">
            <ol style={{ marginBottom: 0, paddingLeft: 20 }}>
              <li>從 API-Sports 拉 MLB 球隊，用 Claude 翻譯</li>
              <li>從 MLB 官方拉球隊，建立 API-Sports ID ↔ MLB ID 對應</li>
              <li>從 MLB 官方拉 30 隊 Roster，用 Claude 翻譯所有現役球員</li>
            </ol>
          </Descriptions.Item>
          <Descriptions.Item label="預期成本">
            球隊 $0.01 + 球員 $0.32 ≈ <Tag color="green">$0.33 USD（NT$11）</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="執行時間">約 5-10 分鐘（取決於球員數量）</Descriptions.Item>
          <Descriptions.Item label="安全機制">已翻譯過的實體會跳過，不會重複扣費</Descriptions.Item>
        </Descriptions>

        <Space>
          <span>賽季：</span>
          <InputNumber
            min={2020}
            max={2030}
            value={season}
            onChange={(v) => setSeason(v ?? new Date().getFullYear())}
          />
        </Space>

        <Divider />

        <Space direction="vertical" style={{ width: '100%' }}>
          <Button
            type="primary"
            size="large"
            icon={<ThunderboltOutlined />}
            loading={mlbSeedMutation.isPending}
            onClick={() => mlbSeedMutation.mutate()}
            danger={mlbSeedMutation.isPending}
          >
            {mlbSeedMutation.isPending ? '執行中，請等待（5-10 分鐘）...' : '一鍵翻譯所有 MLB 實體'}
          </Button>

          {mlbSeedMutation.isPending && (
            <Progress percent={99} status="active" showInfo={false} />
          )}

          {mlbSeedMutation.data?.success && (
            <Alert
              message="執行完成"
              description={
                <div>
                  <div>球隊翻譯：{mlbSeedMutation.data.data.teamsTranslated} 支</div>
                  <div>ID 對應建立：{mlbSeedMutation.data.data.teamIdsMapped} 筆</div>
                  <div>球員翻譯：{mlbSeedMutation.data.data.playersTranslated} 位</div>
                  {mlbSeedMutation.data.data.errors.length > 0 && (
                    <div style={{ color: '#ff4d4f', marginTop: 8 }}>
                      錯誤：{mlbSeedMutation.data.data.errors.join(', ')}
                    </div>
                  )}
                </div>
              }
              type="success"
              showIcon
            />
          )}
        </Space>
      </Card>

      {/* 說明 */}
      <Card title="常見問題">
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="翻譯品質不滿意怎麼辦？">
            翻譯結果存在 translations 表，可透過 SQL 手動修正，或未來會新增「翻譯校正」介面
          </Descriptions.Item>
          <Descriptions.Item label="自動化排程">
            API 啟動時會每小時執行一次 Cron，掃描 API-Sports 的新球隊/球員並自動翻譯
          </Descriptions.Item>
          <Descriptions.Item label="AI 支出上限">
            建議到 Anthropic Console 設定 $20/月花費上限，超過會自動停用 API Key
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
