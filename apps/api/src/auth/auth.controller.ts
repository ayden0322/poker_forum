import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

@ApiTags('認證')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: '帳密註冊' })
  @ApiResponse({ status: 201, description: '註冊成功' })
  async register(@Body() dto: RegisterDto) {
    const result = await this.authService.register(dto);
    return { success: true, data: result };
  }

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '帳密登入' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = (req as any).ip ?? (req as any).socket?.remoteAddress;
    const result = await this.authService.login(dto, ip);
    return { success: true, data: result };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt-refresh'))
  @ApiOperation({ summary: '刷新 Access Token' })
  async refresh(@Req() req: Request & { user: { sub: string; nickname: string; role: string } }) {
    const tokens = await this.authService.refreshTokens(
      req.user.sub,
      req.user.nickname,
      req.user.role,
    );
    return { success: true, data: tokens };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取得目前登入者資訊' })
  async me(@CurrentUser() user: { id: string; nickname: string; role: string }) {
    return { success: true, data: user };
  }

  // ===== 忘記密碼 =====
  @Post('forgot-password')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '忘記密碼 — 發送重設連結' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    // 不論 Email 是否存在，統一回應（防止 Email 列舉）
    return { success: true, message: '若此 Email 已註冊，將收到密碼重設信件' };
  }

  @Post('reset-password')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重設密碼' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { success: true, message: '密碼已重設，請使用新密碼登入' };
  }

  // ===== OAuth 回導目標判斷 =====
  private getOAuthRedirectUrl(req: Request): string {
    const from = (req as any).cookies?.oauth_from;
    if (from === 'admin') {
      return this.configService.get<string>('ADMIN_URL', 'http://localhost:3011');
    }
    return this.configService.get<string>('WEB_URL', 'http://localhost:3000');
  }

  // ===== Google OAuth =====
  @Get('google/admin')
  @ApiOperation({ summary: 'Google OAuth 登入（管理後台）' })
  googleAdminInit(@Res() res: Response) {
    res.cookie('oauth_from', 'admin', { maxAge: 300000, httpOnly: true, sameSite: 'lax' });
    res.redirect('/api/auth/google');
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth 登入導向' })
  googleAuth() {
    // Passport 自動處理導向
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request & { user: any }, @Res() res: Response) {
    const redirectUrl = this.getOAuthRedirectUrl(req);
    const { accessToken, refreshToken } = req.user as { accessToken: string; refreshToken: string };
    res.clearCookie('oauth_from');
    res.redirect(`${redirectUrl}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);
  }

  // ===== Facebook OAuth =====
  @Get('facebook')
  @UseGuards(AuthGuard('facebook'))
  @ApiOperation({ summary: 'Facebook OAuth 登入導向' })
  facebookAuth() {}

  @Get('facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  async facebookCallback(@Req() req: Request & { user: any }, @Res() res: Response) {
    const redirectUrl = this.getOAuthRedirectUrl(req);
    const { accessToken, refreshToken } = req.user as { accessToken: string; refreshToken: string };
    res.clearCookie('oauth_from');
    res.redirect(`${redirectUrl}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);
  }

  // ===== LINE OAuth =====
  @Get('line/admin')
  @ApiOperation({ summary: 'LINE OAuth 登入（管理後台）' })
  lineAdminInit(@Res() res: Response) {
    res.cookie('oauth_from', 'admin', { maxAge: 300000, httpOnly: true, sameSite: 'lax' });
    res.redirect('/api/auth/line');
  }

  @Get('line')
  @UseGuards(AuthGuard('line'))
  @ApiOperation({ summary: 'LINE OAuth 登入導向' })
  lineAuth() {}

  @Get('line/callback')
  @UseGuards(AuthGuard('line'))
  async lineCallback(@Req() req: Request & { user: any }, @Res() res: Response) {
    const redirectUrl = this.getOAuthRedirectUrl(req);
    const { accessToken, refreshToken } = req.user as { accessToken: string; refreshToken: string };
    res.clearCookie('oauth_from');
    res.redirect(`${redirectUrl}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);
  }
}
