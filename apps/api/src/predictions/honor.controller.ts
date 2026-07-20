import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { HonorReadService } from './honor-read.service';

// 榮譽頁讀取：排行榜 / 在位冠軍 / 名人堂 / 圖鑑（公開）；我的榮耀（登入）。
@Controller('honor')
export class HonorController {
  constructor(private readonly read: HonorReadService) {}

  @Get('overview')
  async overview() {
    return { success: true, data: await this.read.overview() };
  }

  @Get('catalog')
  async catalog() {
    return { success: true, data: await this.read.catalog() };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { id: string }) {
    return { success: true, data: await this.read.myHonor(user.id) };
  }
}
