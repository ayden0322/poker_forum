import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@betting-forum/database';
import { TranslationService } from './translation.service';

@ApiTags('admin:translations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/translations')
export class TranslationAdminController {
  constructor(private translation: TranslationService) {}

  @Get('usage')
  @ApiOperation({ summary: '取得本月 Claude AI 使用量與花費' })
  async getUsage() {
    const data = await this.translation.getMonthlyCost();
    return { data };
  }
}
