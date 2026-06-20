/**
 * 後台頁面註冊表：權限矩陣的單一事實來源。
 * - key：頁面識別碼（與前端選單 / 路由對齊）
 * - label：顯示名稱（權限設定頁用）
 * - defaults：首次 seed 進 DB 的預設可見層級（之後由超級管理員在 UI 調整）
 *
 * superAdmin 預設一律 true（超級管理員預設看得到全部）；
 * 之後超級管理員可在「權限設定」把某頁對自己關掉（仍可逆，因為權限設定頁有防鎖死底線）。
 */
export interface PageDef {
  key: string;
  label: string;
  defaults: { moderator: boolean; admin: boolean; superAdmin: boolean };
}

const T = true;
const F = false;

export const ADMIN_PAGES: PageDef[] = [
  // 編輯人員日常
  { key: 'dashboard', label: '儀表板', defaults: { moderator: T, admin: T, superAdmin: T } },
  { key: 'posts', label: '文章管理', defaults: { moderator: T, admin: T, superAdmin: T } },
  { key: 'news', label: '新聞審核', defaults: { moderator: T, admin: T, superAdmin: T } },
  { key: 'reports', label: '檢舉管理', defaults: { moderator: T, admin: T, superAdmin: T } },
  { key: 'feedbacks', label: '意見回報', defaults: { moderator: T, admin: T, superAdmin: T } },
  // 總管理員以上
  { key: 'members', label: '會員管理', defaults: { moderator: F, admin: T, superAdmin: T } },
  { key: 'admins', label: '管理員管理', defaults: { moderator: F, admin: T, superAdmin: T } },
  { key: 'boards', label: '看板管理', defaults: { moderator: F, admin: T, superAdmin: T } },
  { key: 'categories', label: '分類管理', defaults: { moderator: F, admin: T, superAdmin: T } },
  { key: 'tags', label: '標籤管理', defaults: { moderator: F, admin: T, superAdmin: T } },
  { key: 'announcements', label: '站方推送', defaults: { moderator: F, admin: T, superAdmin: T } },
  { key: 'marquee', label: '跑馬燈管理', defaults: { moderator: F, admin: T, superAdmin: T } },
  { key: 'cosmetics', label: '裝飾商店管理', defaults: { moderator: F, admin: T, superAdmin: T } },
  { key: 'world-cup', label: '世界盃管理', defaults: { moderator: F, admin: T, superAdmin: T } },
  { key: 'translations', label: '翻譯管理', defaults: { moderator: F, admin: T, superAdmin: T } },
  // 超級管理員專屬（敏感）
  { key: 'banned-ips', label: '封鎖 IP', defaults: { moderator: F, admin: F, superAdmin: T } },
  { key: 'lottery', label: '彩券管理', defaults: { moderator: F, admin: F, superAdmin: T } },
  { key: 'sms-provider', label: '簡訊服務商', defaults: { moderator: F, admin: F, superAdmin: T } },
  { key: 'sports-settings', label: '運彩 API 設定', defaults: { moderator: F, admin: F, superAdmin: T } },
  { key: 'permissions', label: '權限設定', defaults: { moderator: F, admin: F, superAdmin: T } },
];

/** 永遠對超級管理員開放的頁面（防鎖死底線，不受矩陣關閉影響） */
export const ALWAYS_SUPER_ADMIN_PAGES = new Set(['permissions']);

/**
 * 後端路由 path 的第一段（/admin/<segment>）對應到 pageKey。
 * 用於 PageGuard 自動判定頁面，省去逐一 endpoint 標記。
 * 找不到對應 → PageGuard 會 fail-closed 到 ADMIN 門檻。
 */
export const SEGMENT_TO_PAGE: Record<string, string> = {
  stats: 'dashboard',
  members: 'members',
  posts: 'posts',
  boards: 'boards',
  categories: 'categories',
  tags: 'tags',
  marquees: 'marquee',
  cosmetics: 'cosmetics',
  reports: 'reports',
  feedbacks: 'feedbacks',
  'banned-ips': 'banned-ips',
  permissions: 'permissions',
  'sms-provider': 'sms-provider',
  'sports-config': 'sports-settings',
  'world-cup': 'world-cup',
  translations: 'translations',
};
