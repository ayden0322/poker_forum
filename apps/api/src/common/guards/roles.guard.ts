import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@betting-forum/database';
import { ROLE_RANK, rankOf } from '../role-hierarchy';

export const ROLES_KEY = 'roles';

/**
 * 角色階層守衛：高階角色自動滿足低階角色的要求。
 * 例如 @Roles(ADMIN) 的端點，SUPER_ADMIN 也進得去；
 * 但 @Roles(SUPER_ADMIN) 的端點（如一鍵刪除），一般 ADMIN 進不去。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.role) return false;

    const userRank = rankOf(user.role);
    // 滿足任一要求角色的門檻即可（要求多個角色時取最低門檻）
    return requiredRoles.some((role) => userRank >= (ROLE_RANK[role] ?? Infinity));
  }
}
