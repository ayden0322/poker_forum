import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@betting-forum/database';
import { PagePermissionService } from './page-permission.service';

/**
 * 權限矩陣 / 選單可見性 API。
 * 刻意不掛 PageGuard（這些是「決定權限的元端點」），改用 @Roles 直接把關：
 * - my-pages：編輯人員以上都能拿自己的可見頁（前端選單 / 路由守衛用）
 * - permissions：僅超級管理員可讀寫矩陣
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class PermissionController {
  constructor(private readonly perms: PagePermissionService) {}

  @Roles(Role.MODERATOR)
  @Get('my-pages')
  myPages(@CurrentUser() user: { role: string }) {
    return { data: { pages: this.perms.allowedPagesFor(user.role) } };
  }

  @Roles(Role.SUPER_ADMIN)
  @Get('permissions')
  getPermissions() {
    return { data: this.perms.getMatrix() };
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch('permissions/:pageKey')
  async updatePermission(
    @Param('pageKey') pageKey: string,
    @Body()
    body: { allowModerator?: boolean; allowAdmin?: boolean; allowSuperAdmin?: boolean },
  ) {
    const data = await this.perms.update(pageKey, body);
    return { data };
  }
}
