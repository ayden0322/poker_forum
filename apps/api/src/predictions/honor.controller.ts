import { Controller, Get } from '@nestjs/common';
import { HonorReadService } from './honor-read.service';

// 榮譽頁公開讀取：排行榜 / 在位冠軍 / 名人堂。
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
}
