import { SetMetadata } from '@nestjs/common';

export const CAP_KEY = 'capKey';

/**
 * 標記某端點需要的敏感能力（cap），對應 page-registry 的 ADMIN_CAPS。
 * 例：@RequireCap('member:impersonate')。由 CapabilityGuard 即時查帳號權限把關。
 * SUPER_ADMIN 一律 bypass。
 */
export const RequireCap = (capKey: string) => SetMetadata(CAP_KEY, capKey);
