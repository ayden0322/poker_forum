import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PagePermissionService } from '../../admin/page-permission.service';
import { SEGMENT_TO_PAGE } from '../../admin/page-registry';
import { PAGE_KEY } from '../decorators/require-page.decorator';
import { rankOf, ROLE_RANK } from '../role-hierarchy';

/**
 * 後台頁面權限守衛（帳號級，即時查 DB）。
 * 解析順序：
 * 1. 顯式 @RequirePage(pageKey)
 * 2. 由路徑 /admin/<segment> 自動對應 pageKey
 * 3. 都無 → fail-closed：至少要總管理員(ADMIN) 才放行
 *
 * 一律在 JwtAuthGuard、RolesGuard 之後執行（需要 req.user，含 id 與 role）。
 */
@Injectable()
export class PageGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private perms: PagePermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.id || !user?.role) return false;

    let pageKey: string | undefined = this.reflector.getAllAndOverride<string>(PAGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!pageKey) {
      const path: string = req.path || req.url || '';
      const m = path.match(/\/admin\/([^/?]+)/);
      pageKey = m ? SEGMENT_TO_PAGE[m[1]] : undefined;
    }

    if (!pageKey) {
      // 未知 admin 端點 → 至少需要總管理員（SUPER_ADMIN 亦滿足）
      return rankOf(user.role) >= ROLE_RANK.ADMIN;
    }

    if (!(await this.perms.canAccessPage(user, pageKey))) {
      throw new ForbiddenException('權限不足：此頁面未開放給你');
    }
    return true;
  }
}
