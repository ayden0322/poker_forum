import { Global, Module } from '@nestjs/common';
import { PagePermissionService } from './page-permission.service';
import { PageGuard } from '../common/guards/page.guard';

/**
 * 全域提供權限矩陣服務與 PageGuard，讓各 admin 控制器都能直接 @UseGuards(PageGuard)。
 */
@Global()
@Module({
  providers: [PagePermissionService, PageGuard],
  exports: [PagePermissionService, PageGuard],
})
export class PagePermissionModule {}
