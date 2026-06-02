// 後台角色階層（與後端 apps/api/src/common/role-hierarchy.ts 對齊）
export type AdminRole = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';

/** 數字越大權限越高 */
export const ROLE_RANK: Record<string, number> = {
  USER: 0,
  MODERATOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

/** 角色顯示名稱：超級管理員 > 總管理員 > 編輯人員 > 一般會員 */
export const ROLE_LABEL: Record<string, string> = {
  USER: '一般會員',
  MODERATOR: '編輯人員',
  ADMIN: '總管理員',
  SUPER_ADMIN: '超級管理員',
};

export const rankOf = (role?: string | null): number =>
  role && role in ROLE_RANK ? ROLE_RANK[role] : -1;

/** 頁面 / 選單的最低可見層級 */
export type MinRole = 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';

/** 操作者是否可管理某目標角色（嚴格高於才行；不能動平級或更高） */
export const canManageRole = (actor?: string | null, target?: string | null): boolean =>
  rankOf(actor) > rankOf(target);
