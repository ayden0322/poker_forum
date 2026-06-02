import { SetMetadata } from '@nestjs/common';

export const PAGE_KEY = 'pageKey';

/**
 * 顯式指定某端點對應的後台頁面權限鍵。
 * 多數 /admin/<segment> 端點會由 PageGuard 自動依路徑判定，不需手動標記；
 * 只有路徑無法對應的（如 lottery 在 /lottery 下的管理端點）才需要 @RequirePage。
 */
export const RequirePage = (pageKey: string) => SetMetadata(PAGE_KEY, pageKey);
