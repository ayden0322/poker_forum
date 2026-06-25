import { Global, Module } from '@nestjs/common';
import { PagePermissionService } from './page-permission.service';
import { PageGuard } from '../common/guards/page.guard';
import { CapabilityGuard } from '../common/guards/capability.guard';

/**
 * 全域提供帳號級權限服務與 PageGuard / CapabilityGuard，
 * 讓各 admin 控制器都能直接 @UseGuards(PageGuard) 並標 @RequireCap。
 */
@Global()
@Module({
  providers: [PagePermissionService, PageGuard, CapabilityGuard],
  exports: [PagePermissionService, PageGuard, CapabilityGuard],
})
export class PagePermissionModule {}
