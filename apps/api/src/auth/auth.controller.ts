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
import { getClientIp } from '../common/get-client-ip.util';
import { PrismaService } from '../common/prisma.service';

@ApiTags('認證')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: '帳密註冊' })
  @ApiResponse({ status: 201, description: '註冊成功' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const result = await this.authService.register(dto, getClientIp(req));
    return { success: true, data: result };
  }

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '帳密登入' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = getClientIp(req);
    const result = await this.authService.login(dto, ip);
    return { success: true, data: result };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt-refresh'))
  @ApiOperation({ summary: '刷新 Access Token' })
  async refresh(
    @Req() req: Request & { user: { sub: string; nickname: string; role: string; impersonatedBy?: string } },
  ) {
    const tokens = await this.authService.refreshTokens(
      req.user.sub,
      req.user.nickname,
      req.user.role,
      req.user.impersonatedBy, // 代登入 session 要保留代登入身分、不可升級成正常長效 token
    );
    return { success: true, data: tokens };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取得目前登入者資訊' })
  async me(@CurrentUser() user: { id: string; impersonatedBy?: string }) {
    const data = await this.authService.getMe(user.id);
    // 若當前 session 是管理員代登入，附帶 impersonatedBy 供前端顯示警示橫條
    return { success: true, data: { ...data, impersonatedBy: user.impersonatedBy ?? null } };
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

  /**
   * 結束代登入：當前 token 必須帶有 impersonatedBy 才能呼叫。
   * 回傳原管理員的長效 token，前端用此 token 還原 admin session。
   */
  @Post('stop-impersonation')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '結束管理員代登入，還原為原管理員身分' })
  async stopImpersonation(
    @CurrentUser()
    user: {
      id: string;
      nickname: string;
      impersonatedBy?: string;
    },
    @Req() req: Request,
  ) {
    if (!user.impersonatedBy) {
      return {
        success: false,
        message: '此 session 不是代登入狀態',
      };
    }

    const tokens = await this.authService.stopImpersonation(user.impersonatedBy);

    // 直接用 prisma 寫 audit log（避免循環依賴 AdminService）
    try {
      await this.prisma.auditLog.create({
        data: {
          actorAdminId: user.impersonatedBy,
          actorNickname: '(stop-impersonation)',
          action: 'IMPERSONATE_STOP',
          targetUserId: user.id,
          targetNickname: user.nickname,
          ip: getClientIp(req) ?? null,
          userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
        },
      });
    } catch {
      // audit 寫入失敗不阻擋還原流程
    }

    return { success: true, data: tokens };
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
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth 登入導向（?from=admin 可從後台發起）' })
  googleAuth() {
    // Passport 自動處理導向；middleware 已根據 ?from=admin 設定 cookie
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
  @Get('line')
  @UseGuards(AuthGuard('line'))
  @ApiOperation({ summary: 'LINE OAuth 登入導向（?from=admin 可從後台發起）' })
  lineAuth() {
    // Passport 自動處理導向；middleware 已根據 ?from=admin 設定 cookie
  }

  @Get('line/callback')
  @UseGuards(AuthGuard('line'))
  async lineCallback(@Req() req: Request & { user: any }, @Res() res: Response) {
    const redirectUrl = this.getOAuthRedirectUrl(req);
    const { accessToken, refreshToken } = req.user as { accessToken: string; refreshToken: string };
    res.clearCookie('oauth_from');
    res.redirect(`${redirectUrl}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);
  }
}
