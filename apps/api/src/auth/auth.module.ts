import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';
import { LineStrategy } from './strategies/line.strategy';

// 開發環境載入 .env 確保 OAuth env vars 可用（生產環境由平台注入，不需要 .env）
import { config } from 'dotenv';
import { resolve } from 'path';
if (process.env.NODE_ENV !== 'production') {
  config({ path: resolve(__dirname, '../../../../.env') });
}

const oauthProviders = [];
if (process.env.GOOGLE_CLIENT_ID) oauthProviders.push(GoogleStrategy);
if (process.env.FACEBOOK_CLIENT_ID) oauthProviders.push(FacebookStrategy);
if (process.env.LINE_CHANNEL_ID) oauthProviders.push(LineStrategy);

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRATION', '15m'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    ...oauthProviders,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
