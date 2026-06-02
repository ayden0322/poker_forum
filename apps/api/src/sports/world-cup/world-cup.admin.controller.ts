import { Body, Controller, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PageGuard } from '../../common/guards/page.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@betting-forum/database';
import { WorldCupService } from './world-cup.service';

class UpdateMatchDto {
  @IsOptional() @IsInt() @Min(0) homeScore?: number | null;
  @IsOptional() @IsInt() @Min(0) awayScore?: number | null;
  @IsOptional() @IsIn(['scheduled', 'live', 'finished']) status?: 'scheduled' | 'live' | 'finished';
  @IsOptional() @IsInt() @Min(0) liveMinute?: number | null;
}

/**
 * Admin：手動維護世界盃比分
 * 在沒升級 API-Sports 前，比賽開打後可手動更新比分
 */
@ApiTags('Admin · World Cup')
@ApiBearerAuth()
@Controller('admin/world-cup')
@UseGuards(JwtAuthGuard, RolesGuard, PageGuard)
@Roles(Role.MODERATOR) // floor；可見性由權限矩陣（預設總管理員以上）控制
export class WorldCupAdminController {
  constructor(private readonly svc: WorldCupService) {}

  @Patch('match/:id')
  @ApiOperation({ summary: '手動更新單場比分與狀態' })
  async updateMatch(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMatchDto) {
    return { data: await this.svc.updateMatch(id, dto) };
  }
}
