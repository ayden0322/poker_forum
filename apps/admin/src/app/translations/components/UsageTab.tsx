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
import { ThunderboltOutlined, TranslationOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { adminApiFetch } from '@/lib/api';

const { Text } = Typography;

interface SeedStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  stats: {
    teamsTranslated: number;
    teamIdsMapped: number;
    playersTranslated: number;
    errors: string[];
  };
  currentStep: string;
  monthlyCost: {
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    callCount: number;
  };
}

export function UsageTab() {
  const [season, setSeason] = useState<number>(new Date().getFullYear());
  const [watchingStatus, setWatchingStatus] = useState(false);

  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ['mlb-seed-status'],
    queryFn: () => adminApiFetch<{ data: SeedStatus }>('/admin/mlb-seed/status'),
    refetchInterval: watchingStatus ? 3000 : false,
    staleTime: 0,
  });

  const status = statusData?.data;
  const isRunning = status?.running ?? false;

  React.useEffect(() => {
    if (watchingStatus && status && !status.running) {
      setWatchingStatus(false);
      if (status.finishedAt) {
        message.success('翻譯任務完成！');
      }
    }
    if (status?.running && !watchingStatus) {
      setWatchingStatus(true);
    }
  }, [status, watchingStatus]);

  const startMutation = useMutation({
    mutationFn: () =>
      adminApiFetch<{ success: boolean; message: string; data: SeedStatus }>(
        '/admin/mlb-seed/all',
        { method: 'POST', body: JSON.stringify({ season }) },
      ),
    onSuccess: (res) => {
      if (res.success) {
        message.success('已啟動翻譯任務，請觀察進度');
        setWatchingStatus(true);
      } else {
        message.warning(res.message);
      }
    },
    onError: (e: Error) => message.error(`啟動失敗：${e.message}`),
  });

  return (
    <>
      <Card title="Claude AI 使用量" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="本月花費"
              value={status?.monthlyCost?.totalCostUsd ?? 0}
              precision={4}
              prefix="$"
              suffix="USD"
              valueStyle={{
                color: (status?.monthlyCost?.totalCostUsd ?? 0) > 10 ? '#ff4d4f' : '#3f8600',
              }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              約 NT${Math.ceil((status?.monthlyCost?.totalCostUsd ?? 0) * 32)}
            </Text>
          </Col>
          <Col span={6}>
            <Statistic title="Input Tokens" value={status?.monthlyCost?.totalInputTokens ?? 0} />
          </Col>
          <Col span={6}>
            <Statistic title="Output Tokens" value={status?.monthlyCost?.totalOutputTokens ?? 0} />
          </Col>
          <Col span={6}>
            <Statistic title="呼叫次數" value={status?.monthlyCost?.callCount ?? 0} />
          </Col>
        </Row>
        <Divider style={{ margin: '16px 0' }} />
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetchStatus()}>
            刷新
          </Button>
          <Text type="secondary" style={{ fontSize: 12 }}>
            翻譯成本：Input $1 / M tokens，Output $5 / M tokens
          </Text>
        </Space>
      </Card>

      <Card
        title={
          <Space>
            <TranslationOutlined />
            <span>MLB 一鍵翻譯</span>
            {isRunning && <Tag color="processing">執行中</Tag>}
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
          <Descriptions.Item label="執行時間">
            <Tag color="blue">背景非同步執行</Tag> 約 5-10 分鐘，可關閉頁面
          </Descriptions.Item>
          <Descriptions.Item label="安全機制">已翻譯過的實體會跳過，不會重複扣費</Descriptions.Item>
        </Descriptions>

        <Space>
          <span>賽季：</span>
          <InputNumber
            min={2020}
            max={2030}
            value={season}
            onChange={(v) => setSeason(v ?? new Date().getFullYear())}
            disabled={isRunning}
          />
        </Space>

        <Divider />

        <Space direction="vertical" style={{ width: '100%' }}>
          <Button
            type="primary"
            size="large"
            icon={<ThunderboltOutlined />}
            loading={startMutation.isPending}
            disabled={isRunning}
            onClick={() => startMutation.mutate()}
          >
            {isRunning ? '執行中...' : '一鍵翻譯所有 MLB 實體'}
          </Button>

          {isRunning && status && (
            <Alert
              message={`正在執行：${status.currentStep}`}
              description={
                <div>
                  <div style={{ marginBottom: 8 }}>
                    已翻譯球隊：{status.stats.teamsTranslated} / ID 對應：
                    {status.stats.teamIdsMapped} / 球員：{status.stats.playersTranslated}
                  </div>
                  <Progress percent={99} status="active" showInfo={false} />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    背景執行中，可關閉頁面，每 3 秒自動更新進度
                  </Text>
                </div>
              }
              type="info"
              showIcon
            />
          )}

          {!isRunning && status?.finishedAt && (
            <Alert
              message={
                status.currentStep === '失敗'
                  ? '執行失敗'
                  : status.currentStep === '完成'
                  ? '執行完成'
                  : '尚未執行'
              }
              description={
                <div>
                  <div>球隊翻譯：{status.stats.teamsTranslated} 支</div>
                  <div>ID 對應建立：{status.stats.teamIdsMapped} 筆</div>
                  <div>球員翻譯：{status.stats.playersTranslated} 位</div>
                  <div>完成時間：{new Date(status.finishedAt).toLocaleString('zh-TW')}</div>
                  {status.stats.errors.length > 0 && (
                    <div style={{ color: '#ff4d4f', marginTop: 8 }}>
                      錯誤：{status.stats.errors.join(', ')}
                    </div>
                  )}
                </div>
              }
              type={status.currentStep === '失敗' ? 'error' : 'success'}
              showIcon
            />
          )}
        </Space>
      </Card>
    </>
  );
}
