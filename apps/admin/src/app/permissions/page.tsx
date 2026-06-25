'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';

/**
 * 舊「權限設定」（角色層級矩陣）已停用。
 * 權限改為「帳號級」，於「管理員管理」頁逐一帳號設定。此路由導向 /admins。
 */
export default function DeprecatedPermissionsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admins');
  }, [router]);
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <Spin tip="權限設定已移至『管理員管理』，導向中…" />
    </div>
  );
}
