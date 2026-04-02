import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

const WEAK_SECRETS = [
  'fallback-secret', 'fallback-refresh-secret',
  'your-jwt-secret-change-this', 'your-jwt-refresh-secret-change-this',
  'secret', 'password', 'changeme',
];

async function bootstrap() {
  const logger = new Logger('Bootstrap');

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

  const app = await NestFactory.create(AppModule);

  // 全域前綴
  app.setGlobalPrefix('api');

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

  const port = process.env.PORT || 4010;
  await app.listen(port);
  logger.log(`API 伺服器運行於 http://localhost:${port}`);
}
bootstrap();
