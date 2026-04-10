'use client';

import { Card, Col, Row, Statistic } from 'antd';
import { UserOutlined, FileTextOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';

import { adminApiFetch } from '@/lib/api';

interface StatsResponse {
  data: {
    totalUsers: number;
    totalPosts: number;
    newUsersToday: number;
    newPostsToday: number;
  };
}

export default function DashboardPage() {
  const { data } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApiFetch<StatsResponse>('/admin/stats'),
  });

  const stats = data?.data;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 24 }}>儀表板</h1>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="今日新文章"
              value={stats?.newPostsToday ?? 0}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="今日新會員"
              value={stats?.newUsersToday ?? 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="累計文章數"
              value={stats?.totalPosts ?? 0}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="累計會員數"
              value={stats?.totalUsers ?? 0}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
