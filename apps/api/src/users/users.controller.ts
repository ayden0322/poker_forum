import { Controller, Get, Patch, Post, Delete, Param, Body, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('會員')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  @ApiOperation({ summary: '搜尋會員' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'page', required: false })
  async search(
    @Query('q') q: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    const result = await this.usersService.search(q, page);
    return { success: true, data: result };
  }

  @Get('popular')
  @ApiOperation({ summary: '熱門玩家（近 30 日）' })
  async popular() {
    const result = await this.usersService.getPopularUsers();
    return { success: true, data: result };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取得自己的個人資料' })
  async getMe(@CurrentUser() user: { id: string; nickname: string }) {
    const result = await this.usersService.findByNickname(user.nickname, user.id);
    return { success: true, data: result };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新個人資料' })
  async updateMe(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateProfileDto,
  ) {
    const result = await this.usersService.updateProfile(user.id, dto);
    return { success: true, data: result };
  }

  @Get(':nickname')
  @ApiOperation({ summary: '查看會員個人頁' })
  async getProfile(
    @Param('nickname') nickname: string,
    @CurrentUser() user?: { id: string },
  ) {
    const result = await this.usersService.findByNickname(nickname, user?.id);
    return { success: true, data: result };
  }

  @Get(':nickname/posts')
  @ApiOperation({ summary: '取得會員發文列表' })
  async getUserPosts(
    @Param('nickname') nickname: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    const result = await this.usersService.getUserPosts(nickname, page);
    return { success: true, data: result };
  }

  @Get(':nickname/followers')
  @ApiOperation({ summary: '取得追蹤者列表' })
  async getFollowers(
    @Param('nickname') nickname: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    const result = await this.usersService.getFollowers(nickname, page);
    return { success: true, data: result };
  }

  @Get(':nickname/following')
  @ApiOperation({ summary: '取得追蹤中列表' })
  async getFollowing(
    @Param('nickname') nickname: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    const result = await this.usersService.getFollowing(nickname, page);
    return { success: true, data: result };
  }

  @Get(':nickname/replies')
  @ApiOperation({ summary: '取得會員回覆紀錄' })
  async getUserReplies(
    @Param('nickname') nickname: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    const result = await this.usersService.getUserReplies(nickname, page);
    return { success: true, data: result };
  }

  @Post(':nickname/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '追蹤用戶' })
  async follow(
    @Param('nickname') nickname: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.usersService.follow(user.id, nickname);
  }

  @Delete(':nickname/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消追蹤' })
  async unfollow(
    @Param('nickname') nickname: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.usersService.unfollow(user.id, nickname);
  }
}
