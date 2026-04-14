'use client';

import React from 'react';
import { Tabs, Typography } from 'antd';
import { DashboardOutlined, EditOutlined } from '@ant-design/icons';
import { UsageTab } from './components/UsageTab';
import { CorrectionTab } from './components/CorrectionTab';

const { Title, Paragraph } = Typography;

export default function TranslationsPage() {
  return (
    <div>
      <Title level={3}>翻譯管理</Title>
      <Paragraph type="secondary">
        管理 API-Sports 和 MLB 官方 API 資料的中文翻譯（台灣用語）。使用 Claude Haiku 4.5 AI 自動翻譯，結果存入資料庫後不再重複呼叫。
      </Paragraph>

      <Tabs
        defaultActiveKey="usage"
        items={[
          {
            key: 'usage',
            label: (
              <span>
                <DashboardOutlined /> 使用量監控
              </span>
            ),
            children: <UsageTab />,
          },
          {
            key: 'correction',
            label: (
              <span>
                <EditOutlined /> 翻譯校正
              </span>
            ),
            children: <CorrectionTab />,
          },
        ]}
      />
    </div>
  );
}
