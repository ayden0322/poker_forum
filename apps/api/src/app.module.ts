import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BoardsModule } from './boards/boards.module';
import { PostsModule } from './posts/posts.module';
import { RepliesModule } from './replies/replies.module';
import { PushesModule } from './pushes/pushes.module';
import { BookmarksModule } from './bookmarks/bookmarks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TagsModule } from './tags/tags.module';
import { AdminModule } from './admin/admin.module';
import { LotteryModule } from './lottery/lottery.module';
import { UploadModule } from './upload/upload.module';
import { GifsModule } from './gifs/gifs.module';
import { MailModule } from './mail/mail.module';
import { VerificationModule } from './verification/verification.module';
import { PrismaModule } from './common/prisma.module';
import { ScheduleModule } from '@nestjs/schedule';
import { IpBanMiddleware } from './common/middleware/ip-ban.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,   // 60 秒
      limit: 100,   // 每 60 秒最多 100 次請求
    }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    BoardsModule,
    PostsModule,
    RepliesModule,
    PushesModule,
    BookmarksModule,
    NotificationsModule,
    TagsModule,
    AdminModule,
    LotteryModule,
    UploadModule,
    GifsModule,
    MailModule,
    VerificationModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    IpBanMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(IpBanMiddleware).forRoutes('*');
  }
}
