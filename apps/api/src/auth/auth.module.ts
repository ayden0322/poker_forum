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

// ConfigModule.forRoot() 在 AppModule 層級 isGlobal:true，
// 所以此處 process.env 已經被載入（由 dotenv 處理）。
// 但 NestJS 的 ConfigModule 載入時機是在 module init 之前，
// 所以我們改用 onModuleInit 讓 strategy 在 ConfigService 可用後才註冊。
// 最簡單的方式：直接在此處 require('dotenv').config() 確保 env 已載入。
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

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
