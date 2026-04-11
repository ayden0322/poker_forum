import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { execSync } from 'child_process';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { assertEncryptionKey } from './common/crypto.util';

const WEAK_SECRETS = [
  'fallback-secret', 'fallback-refresh-secret',
  'your-jwt-secret-change-this', 'your-jwt-refresh-secret-change-this',
  'secret', 'password', 'changeme',
];

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // 啟動前同步資料庫 schema（生產環境使用 prisma db push）
  if (process.env.NODE_ENV === 'production') {
    try {
      logger.log('正在同步資料庫 schema...');
      execSync(
        'node ./node_modules/prisma/build/index.js db push --schema=packages/database/prisma/schema.prisma --skip-generate --accept-data-loss',
        { stdio: 'inherit' },
      );
      logger.log('資料庫 schema 同步完成');
    } catch (error) {
      logger.error('資料庫 schema 同步失敗', error);
      process.exit(1);
    }
  }

  // 啟動前檢查必要環境變數
  const jwtSecret = process.env.JWT_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!jwtSecret || !jwtRefreshSecret) {
    logger.error('缺少 JWT_SECRET 或 JWT_REFRESH_SECRET 環境變數，拒絕啟動');
    process.exit(1);
  }

  if (isProduction && (WEAK_SECRETS.includes(jwtSecret) || WEAK_SECRETS.includes(jwtRefreshSecret) || jwtSecret.length < 32)) {
    logger.error('生產環境禁止使用弱密鑰，JWT_SECRET 至少 32 字元');
    process.exit(1);
  }

  // 檢查加密金鑰（用於加密 SMS 廠商 API Key 等敏感資訊）
  try {
    assertEncryptionKey();
  } catch (error) {
    logger.error((error as Error).message);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  // 信任反向代理，讓 req.ip 能從 X-Forwarded-For 取得真正的客戶端 IP
  // （Zeabur / Cloudflare 後面的部署必須）
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  // 全域前綴
  app.setGlobalPrefix('api');

  // Cookie 解析（OAuth admin 來源判斷用）
  app.use(cookieParser());

  // OAuth 來源追蹤：每次 OAuth 發起時根據 ?from=admin 明確設定或清除 cookie
  // 避免殘留 cookie 導致前台 OAuth 被錯誤導向後台
  app.use((req: any, res: any, next: any) => {
    const oauthInitPaths = ['/api/auth/google', '/api/auth/line', '/api/auth/facebook'];
    if (oauthInitPaths.includes(req.path)) {
      if (req.query.from === 'admin') {
        res.cookie('oauth_from', 'admin', { maxAge: 300000, httpOnly: true, sameSite: 'lax' });
      } else {
        res.clearCookie('oauth_from');
      }
    }
    next();
  });

  // 安全 Header
  app.use(helmet());

  // CORS — 限制為明確的白名單
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3010,http://localhost:3011')
    .split(',')
    .map((s) => s.trim());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // 全域異常過濾器
  app.useGlobalFilters(new AllExceptionsFilter());

  // 全域驗證管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger — 僅非生產環境啟用
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('博客邦 API')
      .setDescription('博客邦 RESTful API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger 文件已啟用：/api/docs');
  }

  const port = process.env.PORT || 8080;
  await app.listen(port);
  logger.log(`API 伺服器運行於 http://localhost:${port}`);
}
bootstrap();
