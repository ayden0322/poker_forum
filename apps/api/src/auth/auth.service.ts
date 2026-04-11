import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    // 檢查暱稱重複
    const existingNickname = await this.prisma.user.findUnique({
      where: { nickname: dto.nickname },
    });
    if (existingNickname) {
      throw new ConflictException('此暱稱已被使用');
    }

    // 檢查帳號重複
    const existingAccount = await this.prisma.user.findUnique({
      where: { account: dto.account },
    });
    if (existingAccount) {
      throw new ConflictException('此帳號已被使用');
    }

    // 檢查 Email 重複（若有填）
    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException('此 Email 已被使用');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        nickname: dto.nickname,
        account: dto.account,
        passwordHash,
        email: dto.email ?? null,
      },
      select: { id: true, nickname: true, role: true, avatar: true, level: true, createdAt: true },
    });

    const tokens = await this.generateTokens(user.id, user.nickname, user.role);
    return { user, ...tokens };
  }

  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { account: dto.account },
      select: { id: true, nickname: true, role: true, status: true, passwordHash: true, avatar: true, level: true },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('帳號已被停用');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('帳號或密碼錯誤');
    }

    await this.recordLoginMeta(user.id, ip);

    const { passwordHash: _, ...safeUser } = user;
    const tokens = await this.generateTokens(user.id, user.nickname, user.role);
    return { user: safeUser, ...tokens };
  }

  async oauthLogin(
    provider: string,
    providerId: string,
    profile: {
      nickname: string;
      email?: string;
      avatar?: string;
    },
    ip?: string,
  ) {
    // 找是否已有此 OAuth 綁定
    const existing = await this.prisma.oAuthProvider.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: { select: { id: true, nickname: true, role: true, status: true, avatar: true, level: true } } },
    });

    if (existing) {
      if (existing.user.status !== 'ACTIVE') {
        throw new UnauthorizedException('帳號已被停用');
      }
      await this.recordLoginMeta(existing.user.id, ip);
      const tokens = await this.generateTokens(existing.user.id, existing.user.nickname, existing.user.role);
      return { user: existing.user, ...tokens };
    }

    // 若 Email 已存在，綁定到既有帳號
    if (profile.email) {
      const userByEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (userByEmail) {
        await this.prisma.oAuthProvider.create({
          data: { provider, providerId, userId: userByEmail.id },
        });
        await this.recordLoginMeta(userByEmail.id, ip);
        const tokens = await this.generateTokens(userByEmail.id, userByEmail.nickname, userByEmail.role);
        return {
          user: { id: userByEmail.id, nickname: userByEmail.nickname, role: userByEmail.role, avatar: userByEmail.avatar, level: userByEmail.level, status: userByEmail.status },
          ...tokens,
        };
      }
    }

    // 建立新帳號（暱稱若重複自動加後綴）
    let nickname = profile.nickname.substring(0, 8);
    const nicknameExists = await this.prisma.user.findUnique({ where: { nickname } });
    if (nicknameExists) {
      nickname = nickname.substring(0, 5) + Math.random().toString(36).substring(2, 5);
    }

    const newUser = await this.prisma.user.create({
      data: {
        nickname,
        email: profile.email ?? null,
        avatar: profile.avatar ?? null,
        oauthProviders: { create: { provider, providerId } },
      },
      select: { id: true, nickname: true, role: true, avatar: true, level: true, status: true },
    });

    await this.recordLoginMeta(newUser.id, ip);
    const tokens = await this.generateTokens(newUser.id, newUser.nickname, newUser.role);
    return { user: newUser, ...tokens };
  }

  /** 記錄最後登入 IP 與時間（反向代理後需經由 getClientIp 取值） */
  private async recordLoginMeta(userId: string, ip?: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        ...(ip ? { lastLoginIp: ip.replace(/^::ffff:/, '') } : {}),
      },
    });
  }

  async refreshTokens(userId: string, nickname: string, role: string) {
    return this.generateTokens(userId, nickname, role);
  }

  /** 忘記密碼 — 產生重設 token */
  async forgotPassword(email: string) {
    const logger = new Logger('ForgotPassword');

    // 不論 Email 是否存在，回應一致（防止 Email 列舉）
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    // 作廢該使用者所有舊的重設 token
    await this.prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // 產生 64 字元隨機 token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 分鐘

    await this.prisma.passwordReset.create({
      data: { userId: user.id, token, expiresAt },
    });

    // TODO: 接上 SMTP 後改為真正寄信
    const webUrl = this.configService.get<string>('WEB_URL', 'http://localhost:3010');
    const resetLink = `${webUrl}/reset-password?token=${token}`;
    logger.log(`[密碼重設] 使用者 ${user.nickname} (${email}) 的重設連結：${resetLink}`);

    return;
  }

  /** 重設密碼 — 驗證 token 並更新密碼 */
  async resetPassword(token: string, newPassword: string) {
    const record = await this.prisma.passwordReset.findUnique({
      where: { token },
      include: { user: { select: { id: true, nickname: true } } },
    });

    if (!record) {
      throw new BadRequestException('無效的重設連結');
    }

    if (record.usedAt) {
      throw new BadRequestException('此重設連結已使用過');
    }

    if (record.expiresAt < new Date()) {
      throw new BadRequestException('重設連結已過期，請重新申請');
    }

    // 更新密碼
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });

    // 標記 token 已使用（一次性）
    await this.prisma.passwordReset.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    return;
  }

  private async generateTokens(userId: string, nickname: string, role: string) {
    const payload = { sub: userId, nickname, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
