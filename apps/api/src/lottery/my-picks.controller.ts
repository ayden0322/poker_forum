import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MyPicksService } from './my-picks.service';
import { GameType, GAME_CONFIG } from './lottery.service';

const VALID_GAME_TYPES = Object.keys(GAME_CONFIG);

class CreatePickDto {
  @IsString() @IsIn(VALID_GAME_TYPES)
  gameType!: string;

  @IsString() @MinLength(1) @MaxLength(30)
  label!: string;

  @IsArray()
  numbers!: number[];

  @IsOptional() @IsArray()
  specialNum?: number[];
}

class UpdatePickDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(30)
  label?: string;
}

@ApiTags('我的彩券號碼')
@ApiBearerAuth()
@Controller('lottery/my-picks')
@UseGuards(JwtAuthGuard)
export class MyPicksController {
  constructor(private svc: MyPicksService) {}

  @Get()
  @ApiOperation({ summary: '取得使用者所有號碼組（含對獎結果）' })
  async list(@CurrentUser() user: { id: string }) {
    const data = await this.svc.list(user.id);
    return { data };
  }

  @Post()
  @ApiOperation({ summary: '新增號碼組' })
  async create(@CurrentUser() user: { id: string }, @Body() dto: CreatePickDto) {
    const data = await this.svc.create(user.id, {
      gameType: dto.gameType as GameType,
      label: dto.label,
      numbers: dto.numbers,
      specialNum: dto.specialNum,
    });
    return { data };
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新號碼組（目前僅支援改名）' })
  async update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdatePickDto,
  ) {
    const data = await this.svc.update(user.id, id, dto);
    return { data };
  }

  @Delete(':id')
  @ApiOperation({ summary: '刪除號碼組' })
  async delete(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.svc.delete(user.id, id);
  }
}
