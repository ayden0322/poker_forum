import { Role } from '@betting-forum/database';

/**
 * 角色階層：數字越大權限越高。
 * 超級管理員(SUPER_ADMIN) > 總管理員(ADMIN) > 編輯人員(MODERATOR) > 一般會員(USER)
 *
 * 後台授權一律以「rank 是否 >= 要求門檻」判斷，高階自動涵蓋低階。
 */
export const ROLE_RANK: Record<Role, number> = {
  [Role.USER]: 0,
  [Role.MODERATOR]: 1,
  [Role.ADMIN]: 2,
  [Role.SUPER_ADMIN]: 3,
};

/** 取得角色 rank；未知角色回 -1（最低，等於沒權限） */
export const rankOf = (role?: string | null): number =>
  role && role in ROLE_RANK ? ROLE_RANK[role as Role] : -1;

/** 可進入後台的最低層級：編輯人員（含）以上 */
export const ADMIN_PANEL_MIN_RANK = ROLE_RANK[Role.MODERATOR];

/** 是否具備進入後台的資格（編輯人員以上） */
export const canEnterAdminPanel = (role?: string | null): boolean =>
  rankOf(role) >= ADMIN_PANEL_MIN_RANK;
