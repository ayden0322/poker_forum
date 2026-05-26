import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PostsTask } from './posts.task';

@Module({
  controllers: [PostsController],
  providers: [PostsService, PostsTask],
  exports: [PostsService],
})
export class PostsModule {}
