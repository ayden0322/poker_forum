'use client';

/**
 * 翻譯播種統一管理面板
 *
 * 設計：
 * - 頂部：Claude AI 使用量（共用）
 * - 中段：運動類別篩選（棒球 / 籃球 / 全部）
 * - 下方：每個聯賽一張獨立卡片（同時最多一個任務執行）
 *
 * 加新聯賽只要在 SEED_CONFIGS 加一筆即可，UI 自動產出對應卡片。
 */

import React, { useState, useMemo } from 'react';
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
  Progress,
  Segmented,
  Tooltip,
  Empty,
  Modal,
} from 'antd';
import {
  ThunderboltOutlined,
  TranslationOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApiFetch } from '@/lib/api';

const { Text, Paragraph } = Typography;

/* ─────────────── 型別 ─────────────── */

/** MLB / NBA 用結構（key 在頂層） */
interface FlatSeedStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  stats: {
    teamsTranslated?: number;
    teamIdsMapped?: number;
    playersTranslated?: number;
    errors?: string[];
  };
  currentStep: string;
  monthlyCost?: MonthlyCost;
}

/** Baseball-seed 結構（CPBL/NPB/KBO 共用同 controller，stats 用 league 為 key） */
interface NestedSeedStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  stats: Record<string, { teams: number; players: number; errors: string[] }>;
  currentStep: string;
  monthlyCost?: MonthlyCost;
}

interface MonthlyCost {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
}

type SeedStatus = FlatSeedStatus | NestedSeedStatus;

/* ─────────────── 聯賽配置 ─────────────── */

interface SeedConfig {
  /** 唯一鍵（也是 baseball-seed 的 league key） */
  key: string;
  /** 運動類別：用於篩選 */
  sport: 'baseball' | 'basketball' | 'football';
  /** 顯示名（中文） */
  name: string;
  /** 縮寫 */
  abbr: string;
  /** 國旗 emoji */
  flag: string;
  /** 圖示 emoji */
  icon: string;
  /** 主題色（漸層底） */
  color: string;
  /** Status endpoint */
  statusUrl: string;
  /** Start endpoint */
  startUrl: string;
  /** Start body 產生器 */
  payload: () => Record<string, unknown>;
  /** 成本估算 */
  cost: string;
  /** 預估時間 */
  estimatedTime: string;
  /** 從 status 取出此聯賽已翻譯數量的方法 */
  extractCounts: (status: SeedStatus | undefined) => { teams: number; players: number };
  /** 額外備註（選填） */
  note?: string;
  /** 執行步驟說明 */
  steps: string[];
}

/** 從 MLB / NBA 風格 status 提取 */
const flatExtract = (s?: SeedStatus) => ({
  teams: ((s as FlatSeedStatus | undefined)?.stats?.teamsTranslated as number) ?? 0,
  players: ((s as FlatSeedStatus | undefined)?.stats?.playersTranslated as number) ?? 0,
});

/** 從 baseball-seed 風格 status 提取（用 league key） */
const nestedExtract = (key: string) => (s?: SeedStatus) => ({
  teams: ((s as NestedSeedStatus | undefined)?.stats?.[key]?.teams as number) ?? 0,
  players: ((s as NestedSeedStatus | undefined)?.stats?.[key]?.players as number) ?? 0,
});

const SEED_CONFIGS: SeedConfig[] = [
  {
    key: 'mlb',
    sport: 'baseball',
    name: '美國職棒大聯盟',
    abbr: 'MLB',
    flag: '🇺🇸',
    icon: '⚾',
    color: '#1e40af',
    statusUrl: '/admin/mlb-seed/status',
    startUrl: '/admin/mlb-seed/all',
    payload: () => ({ season: new Date().getFullYear() }),
    cost: '~$0.33',
    estimatedTime: '5-10 分鐘',
    extractCounts: flatExtract,
    steps: [
      '從 API-Sports 拉 MLB 球隊，用 Claude 翻譯',
      '從 MLB 官方拉球隊，建立 ID 對應',
      '從 MLB 官方拉 30 隊 Roster，翻譯所有現役球員',
    ],
  },
  {
    key: 'nba',
    sport: 'basketball',
    name: '美國職籃',
    abbr: 'NBA',
    flag: '🇺🇸',
    icon: '🏀',
    color: '#ea580c',
    statusUrl: '/admin/nba-seed/status',
    startUrl: '/admin/nba-seed/all',
    payload: () => ({ skipPlayers: true }),
    cost: '~$0.005',
    estimatedTime: '~10 秒',
    extractCounts: flatExtract,
    note: '球員姓名保留英文，僅翻譯 30 隊',
    steps: [
      '從 API-Sports 拉 NBA 球隊，用 Claude 翻譯',
      '從 ESPN 拉 30 隊，建立 ID 對應',
    ],
  },
  {
    key: 'cpbl',
    sport: 'baseball',
    name: '中華職棒',
    abbr: 'CPBL',
    flag: '🇹🇼',
    icon: '⚾',
    color: '#16a34a',
    statusUrl: '/admin/baseball-seed/status',
    startUrl: '/admin/baseball-seed/all',
    payload: () => ({ leagues: ['cpbl'] }),
    cost: '~$0.05',
    estimatedTime: '1-2 分鐘',
    extractCounts: nestedExtract('cpbl'),
    steps: ['從 API-Sports 拉 CPBL 球隊', '翻譯所有現役球員'],
  },
  {
    key: 'npb',
    sport: 'baseball',
    name: '日本職棒',
    abbr: 'NPB',
    flag: '🇯🇵',
    icon: '⚾',
    color: '#dc2626',
    statusUrl: '/admin/baseball-seed/status',
    startUrl: '/admin/baseball-seed/all',
    payload: () => ({ leagues: ['npb'] }),
    cost: '~$0.10',
    estimatedTime: '2-3 分鐘',
    extractCounts: nestedExtract('npb'),
    steps: ['從 API-Sports 拉 NPB 12 球團', '翻譯日文球員姓名'],
  },
  {
    key: 'kbo',
    sport: 'baseball',
    name: '韓國職棒',
    abbr: 'KBO',
    flag: '🇰🇷',
    icon: '⚾',
    color: '#a16207',
    statusUrl: '/admin/baseball-seed/status',
    startUrl: '/admin/baseball-seed/all',
    payload: () => ({ leagues: ['kbo'] }),
    cost: '~$0.05',
    estimatedTime: '1-2 分鐘',
    extractCounts: nestedExtract('kbo'),
    steps: ['從 API-Sports 拉 KBO 10 球團', '翻譯韓文球員姓名'],
  },
];

const SPORT_TABS = [
  { value: 'all', label: '全部', icon: '🌐' },
  { value: 'baseball', label: '棒球', icon: '⚾' },
  { value: 'basketball', label: '籃球', icon: '🏀' },
] as const;

/* ─────────────── 主元件 ─────────────── */

export function UsageTab() {
  const [filter, setFilter] = useState<'all' | 'baseball' | 'basketball'>('all');

  const filteredConfigs = useMemo(
    () => SEED_CONFIGS.filter((c) => filter === 'all' || c.sport === filter),
    [filter],
  );

  // 共用 monthlyCost：用 NBA 的 status 取得（任何 controller 都會回 monthlyCost）
  const { data: nbaStatus, refetch: refetchCost } = useQuery({
    queryKey: ['seed-cost-source'],
    queryFn: () => adminApiFetch<{ data: SeedStatus }>('/admin/nba-seed/status'),
    refetchInterval: 30_000,
    staleTime: 0,
  });
  const monthlyCost = nbaStatus?.data?.monthlyCost;

  return (
    <>
      {/* === Claude AI 使用量 === */}
      <Card
        title={
          <Space>
            <ThunderboltOutlined style={{ color: '#faad14' }} />
            <span>Claude AI 使用量（本月）</span>
          </Space>
        }
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={() => refetchCost()}>
            刷新
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Statistic
              title="本月花費"
              value={monthlyCost?.totalCostUsd ?? 0}
              precision={4}
              prefix="$"
              suffix="USD"
              valueStyle={{
                color: (monthlyCost?.totalCostUsd ?? 0) > 10 ? '#ff4d4f' : '#3f8600',
              }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              約 NT${Math.ceil((monthlyCost?.totalCostUsd ?? 0) * 32)}
            </Text>
          </Col>
          <Col xs={12} md={6}>
            <Statistic title="Input Tokens" value={monthlyCost?.totalInputTokens ?? 0} />
          </Col>
          <Col xs={12} md={6}>
            <Statistic title="Output Tokens" value={monthlyCost?.totalOutputTokens ?? 0} />
          </Col>
          <Col xs={12} md={6}>
            <Statistic title="呼叫次數" value={monthlyCost?.callCount ?? 0} />
          </Col>
        </Row>
        <Divider style={{ margin: '12px 0' }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          <InfoCircleOutlined /> Claude Haiku 4.5：Input $1 / M tokens，Output $5 / M tokens
        </Text>
      </Card>

      {/* === 翻譯播種管理 === */}
      <Card
        title={
          <Space>
            <TranslationOutlined />
            <span>翻譯播種管理</span>
            <Tag color="blue">{filteredConfigs.length} 個聯賽</Tag>
          </Space>
        }
        extra={
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as typeof filter)}
            options={SPORT_TABS.map((t) => ({
              value: t.value,
              label: (
                <span>
                  {t.icon} {t.label}
                </span>
              ),
            }))}
          />
        }
      >
        <Alert
          message="什麼時候需要執行？"
          description="① 首次部署後 ② 新球季開始（有新球員加入）③ 球隊大規模交易後。已翻譯的實體會自動跳過，重複執行不會多扣費。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        {filteredConfigs.length === 0 ? (
          <Empty description="此分類下無聯賽" />
        ) : (
          <Row gutter={[16, 16]}>
            {filteredConfigs.map((cfg) => (
              <Col xs={24} sm={12} lg={8} key={cfg.key}>
                <SeedCard config={cfg} />
              </Col>
            ))}
          </Row>
        )}
      </Card>
    </>
  );
}

/* ─────────────── 單聯賽卡片 ─────────────── */

function SeedCard({ config }: { config: SeedConfig }) {
  const queryClient = useQueryClient();
  const [detailVisible, setDetailVisible] = useState(false);

  const { data: statusData } = useQuery({
    queryKey: ['seed-status', config.statusUrl],
    queryFn: () => adminApiFetch<{ data: SeedStatus }>(config.statusUrl),
    refetchInterval: (q) => (q.state.data?.data?.running ? 3000 : 30_000),
    staleTime: 0,
  });

  const status = statusData?.data;
  const isRunning = status?.running ?? false;
  const counts = config.extractCounts(status);
  const isLatestRun =
    status?.startedAt && status?.currentStep && status.currentStep !== 'idle' && status.currentStep !== '準備中';

  // 是否「這場任務跟此聯賽有關」— 對 baseball-seed 共用 controller 要小心
  // 簡單策略：若 controller 共用且有人在跑，先 disable 整組
  const startMutation = useMutation({
    mutationFn: () =>
      adminApiFetch<{ success: boolean; message: string; data: SeedStatus }>(config.startUrl, {
        method: 'POST',
        body: JSON.stringify(config.payload()),
      }),
    onSuccess: (res) => {
      if (res.success) {
        message.success(`${config.name} 翻譯任務已啟動`);
        queryClient.invalidateQueries({ queryKey: ['seed-status', config.statusUrl] });
      } else {
        message.warning(res.message);
      }
    },
    onError: (e: Error) => message.error(`啟動失敗：${e.message}`),
  });

  const lastFinish = status?.finishedAt ? new Date(status.finishedAt).toLocaleString('zh-TW') : null;
  const isCompleted = !isRunning && status?.currentStep === '完成';
  const isFailed = !isRunning && status?.currentStep === '失敗';

  const stateTag = isRunning ? (
    <Tag color="processing" icon={<ClockCircleOutlined />}>
      執行中
    </Tag>
  ) : isCompleted ? (
    <Tag color="success" icon={<CheckCircleOutlined />}>
      已完成
    </Tag>
  ) : isFailed ? (
    <Tag color="error" icon={<CloseCircleOutlined />}>
      失敗
    </Tag>
  ) : (
    <Tag>尚未執行</Tag>
  );

  const headerStyle: React.CSSProperties = {
    background: `linear-gradient(135deg, ${config.color}15 0%, ${config.color}05 100%)`,
    borderTop: `3px solid ${config.color}`,
    padding: '12px 16px',
    margin: '-12px -16px 12px',
    borderRadius: '8px 8px 0 0',
  };

  return (
    <>
      <Card
        size="small"
        styles={{ body: { padding: 16 } }}
        style={{ height: '100%' }}
        hoverable={!isRunning}
      >
        {/* Header：彩色頂部色條 */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>{config.icon}</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: config.color }}>
              {config.abbr}
            </span>
            <span style={{ fontSize: 16 }}>{config.flag}</span>
            <div style={{ marginLeft: 'auto' }}>{stateTag}</div>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {config.name}
          </Text>
        </div>

        {/* 統計 */}
        <Row gutter={8} style={{ marginBottom: 12 }}>
          <Col span={12}>
            <Statistic title="球隊翻譯" value={counts.teams} valueStyle={{ fontSize: 18 }} />
          </Col>
          <Col span={12}>
            <Statistic title="球員翻譯" value={counts.players} valueStyle={{ fontSize: 18 }} />
          </Col>
        </Row>

        {/* 元資料 */}
        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 12, lineHeight: 1.7 }}>
          <div>
            💰 預估成本 <Text strong>{config.cost}</Text> · ⏱ {config.estimatedTime}
          </div>
          {config.note && (
            <div style={{ color: '#fa8c16' }}>
              <InfoCircleOutlined /> {config.note}
            </div>
          )}
          {lastFinish && (
            <div>
              📅 上次：<Text type="secondary">{lastFinish}</Text>
            </div>
          )}
        </div>

        {/* 進行中：進度條 */}
        {isRunning && (
          <Alert
            message={status?.currentStep || '準備中'}
            type="info"
            showIcon
            style={{ marginBottom: 12, padding: '6px 10px' }}
          />
        )}
        {isRunning && (
          <Progress percent={99} status="active" showInfo={false} style={{ marginBottom: 12 }} />
        )}

        {/* 失敗：紅色提示 */}
        {isFailed && status?.stats && 'errors' in (status.stats as object) && (
          <Alert
            message="執行失敗"
            description={(status as FlatSeedStatus).stats.errors?.join('，')}
            type="error"
            showIcon
            style={{ marginBottom: 12, padding: '6px 10px' }}
          />
        )}

        {/* 操作按鈕 */}
        <Space style={{ width: '100%' }} size="small">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={startMutation.isPending || isRunning}
            disabled={isRunning}
            onClick={() => startMutation.mutate()}
            style={{
              backgroundColor: !isRunning ? config.color : undefined,
              borderColor: !isRunning ? config.color : undefined,
              flex: 1,
            }}
            block
          >
            {isRunning ? '執行中…' : '一鍵翻譯'}
          </Button>
          <Tooltip title="查看詳細執行步驟">
            <Button icon={<InfoCircleOutlined />} onClick={() => setDetailVisible(true)} />
          </Tooltip>
        </Space>
      </Card>

      {/* 詳細說明 Modal */}
      <Modal
        title={
          <Space>
            <span style={{ fontSize: 22 }}>{config.icon}</span>
            <span>{config.abbr}</span>
            <Text type="secondary">{config.name}</Text>
          </Space>
        }
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            關閉
          </Button>,
          <Button
            key="run"
            type="primary"
            icon={<PlayCircleOutlined />}
            disabled={isRunning}
            loading={startMutation.isPending}
            onClick={() => {
              setDetailVisible(false);
              startMutation.mutate();
            }}
            style={{
              backgroundColor: !isRunning ? config.color : undefined,
              borderColor: !isRunning ? config.color : undefined,
            }}
          >
            執行翻譯
          </Button>,
        ]}
      >
        <Paragraph>
          <Text strong>執行步驟：</Text>
          <ol style={{ paddingLeft: 20, marginTop: 8 }}>
            {config.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Paragraph>
        <Paragraph>
          <Text strong>預估資源：</Text>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>
              成本 <Tag color="green">{config.cost}</Tag>
            </li>
            <li>
              時間 <Tag color="blue">{config.estimatedTime}</Tag>
            </li>
            <li>
              背景非同步執行：可關閉頁面，每 3 秒自動更新進度
            </li>
            <li>已翻譯的實體會跳過，重複執行不會額外扣費</li>
          </ul>
        </Paragraph>
        {config.note && (
          <Alert message="特別說明" description={config.note} type="warning" showIcon />
        )}
      </Modal>
    </>
  );
}
