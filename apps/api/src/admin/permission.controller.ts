import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@betting-forum/database';
import { PagePermissionService } from './page-permission.service';

/**
 * 「決定選單可見性」的元端點。刻意不掛 PageGuard（避免雞生蛋），改用 @Roles floor 把關。
 * - my-pages：回傳該帳號可見的頁面 key（前端選單 / 路由守衛用）
 * - my-permissions：回傳該帳號完整權限（前端隱藏無權按鈕用；真正把關仍在後端 Guard）
 *
 * 管理員「設定他人權限」的端點不在這裡，而在 AdminController（/admin/admins/:id/permissions，
 * 受 PageGuard page:admins + 服務層級聯/防擴張護欄保護）。
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class PermissionController {
  constructor(private readonly perms: PagePermissionService) {}

  @Roles(Role.MODERATOR)
  @Get('my-pages')
  async myPages(@CurrentUser() user: { id: string; role: string }) {
    return { data: { pages: await this.perms.allowedPageKeysFor(user) } };
  }

  @Roles(Role.MODERATOR)
  @Get('my-permissions')
  async myPermissions(@CurrentUser() user: { id: string; role: string }) {
    return { data: await this.perms.getMyPermissions(user) };
  }
}
