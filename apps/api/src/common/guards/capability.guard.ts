import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PagePermissionService } from '../../admin/page-permission.service';
import { CAP_KEY } from '../decorators/require-cap.decorator';

/**
 * 敏感能力守衛（帳號級，即時查 DB）。
 * 只在標了 @RequireCap('...') 的端點生效；沒標則直接放行（交給 PageGuard / RolesGuard）。
 * SUPER_ADMIN 一律 bypass（由 service.hasCapability 處理）。
 * 一律在 JwtAuthGuard 之後執行（需要 req.user，含 id 與 role）。
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private perms: PagePermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const capKey = this.reflector.getAllAndOverride<string>(CAP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!capKey) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.id || !user?.role) return false;

    if (!(await this.perms.hasCapability(user, capKey))) {
      throw new ForbiddenException('權限不足：你沒有執行此操作的能力');
    }
    return true;
  }
}
