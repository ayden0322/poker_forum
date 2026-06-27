/**
 * 後台權限目錄：帳號級權限（AdminPermission）的「單一事實來源」。
 * 所有 Guard / 服務 / backfill / 前端 UI 都只認這份 registry 的 key，避免拼字漂移。
 *
 * permKey 兩類：
 *   page:<key>  頁面存取（對應 ADMIN_PAGES）
 *   cap:<key>   敏感能力（對應 ADMIN_CAPS）
 *
 * 規則：
 * - 有列 = 有權限；無列 = 無權限。
 * - SUPER_ADMIN 一律 bypass（永遠全開、不寫列），故天生防鎖死。
 * - 「新聞審核」沿用文章權限（page:posts），不獨立成 key（前端仍是兩個選單，但同一把鑰匙）。
 */
export interface PageDef {
  key: string;
  label: string;
  /** 首次建立管理員時的預設可見層級（沿用舊矩陣語意，作為新帳號 seed 模板） */
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
  { key: 'promo', label: '推廣管理', defaults: { moderator: F, admin: T, superAdmin: T } },
  { key: 'world-cup', label: '世界盃管理', defaults: { moderator: F, admin: T, superAdmin: T } },
  { key: 'translations', label: '翻譯管理', defaults: { moderator: F, admin: T, superAdmin: T } },
  // 超級管理員專屬（敏感）
  { key: 'banned-ips', label: '封鎖 IP', defaults: { moderator: F, admin: F, superAdmin: T } },
  { key: 'lottery', label: '彩券管理', defaults: { moderator: F, admin: F, superAdmin: T } },
  { key: 'sms-provider', label: '簡訊服務商', defaults: { moderator: F, admin: F, superAdmin: T } },
  { key: 'sports-settings', label: '運彩 API 設定', defaults: { moderator: F, admin: F, superAdmin: T } },
];

/** 敏感能力定義（cap:<key>）。group 用於前端權限編輯器分組顯示。 */
export interface CapDef {
  key: string;
  label: string;
  group: string;
  /** 預設給哪些角色（新帳號 seed 用，沿用現行行為） */
  defaults: { moderator: boolean; admin: boolean };
}

export const ADMIN_CAPS: CapDef[] = [
  { key: 'member:pii', label: '查看會員完整個資（手機 / Email / 帳號 / 登入 IP）', group: '會員與帳號', defaults: { moderator: F, admin: T } },
  { key: 'member:impersonate', label: '代登入會員', group: '會員與帳號', defaults: { moderator: F, admin: T } },
  { key: 'member:reset_password', label: '重設會員密碼', group: '會員與帳號', defaults: { moderator: F, admin: T } },
  { key: 'post:batch_delete', label: '一鍵批次刪文', group: '內容營運', defaults: { moderator: F, admin: F } },
];

// ===== permKey 工具 =====
export const PAGE_PREFIX = 'page:';
export const CAP_PREFIX = 'cap:';
export const pagePerm = (key: string) => `${PAGE_PREFIX}${key}`;
export const capPerm = (key: string) => `${CAP_PREFIX}${key}`;

/**
 * 某「選單頁面」實際需要的 permKey。
 * 新聞審核（news）共用文章權限（page:posts），其餘頁面對應自身 page:<key>。
 */
export const pageRequiredPerm = (pageKey: string): string =>
  pageKey === 'news' ? pagePerm('posts') : pagePerm(pageKey);

/** 可被「授予 / 編輯」的頁面 key（排除 news，因其併入 posts，不是獨立 permKey） */
export const GRANTABLE_PAGE_KEYS = ADMIN_PAGES.map((p) => p.key).filter((k) => k !== 'news');

/** registry 內所有合法 permKey（驗證 PUT/copy 輸入用） */
export const ALL_PERM_KEYS = new Set<string>([
  ...GRANTABLE_PAGE_KEYS.map(pagePerm),
  ...ADMIN_CAPS.map((c) => capPerm(c.key)),
]);

/** 某能力 key（cap:member:pii）→ 是否為合法能力 */
export const isValidPermKey = (permKey: string): boolean => ALL_PERM_KEYS.has(permKey);

/** 新建管理員時，依角色給的預設 permKey 模板（與 migration backfill 等價）。 */
export const defaultPermKeysForRole = (role: 'MODERATOR' | 'ADMIN'): string[] => {
  const lower = role === 'MODERATOR' ? 'moderator' : 'admin';
  const pages = GRANTABLE_PAGE_KEYS.filter((k) => {
    const def = ADMIN_PAGES.find((p) => p.key === k)!;
    return def.defaults[lower as 'moderator' | 'admin'];
  }).map(pagePerm);
  const caps = ADMIN_CAPS.filter((c) => c.defaults[lower as 'moderator' | 'admin']).map((c) =>
    capPerm(c.key),
  );
  return [...pages, ...caps];
};

/**
 * 前端權限編輯器用的完整目錄（含分組與 label）。
 */
export const PERMISSION_CATALOG = {
  pages: ADMIN_PAGES.filter((p) => p.key !== 'news').map((p) => ({
    permKey: pagePerm(p.key),
    label: p.label,
  })),
  caps: ADMIN_CAPS.map((c) => ({ permKey: capPerm(c.key), label: c.label, group: c.group })),
};

/**
 * 後端路由 /admin/<segment> 的第一段 → pageKey，PageGuard 自動判定用。
 * 找不到對應 → PageGuard fail-closed 到 ADMIN 門檻。
 */
export const SEGMENT_TO_PAGE: Record<string, string> = {
  stats: 'dashboard',
  members: 'members',
  admins: 'admins',
  posts: 'posts',
  boards: 'boards',
  categories: 'categories',
  tags: 'tags',
  marquees: 'marquee',
  cosmetics: 'cosmetics',
  promo: 'promo',
  reports: 'reports',
  feedbacks: 'feedbacks',
  'banned-ips': 'banned-ips',
  'sms-provider': 'sms-provider',
  'sports-config': 'sports-settings',
  'world-cup': 'world-cup',
  translations: 'translations',
};
