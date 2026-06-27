import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PostsTask } from './posts.task';
import { TagsModule } from '../tags/tags.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TagsModule, TasksModule],
  controllers: [PostsController],
  providers: [PostsService, PostsTask],
  exports: [PostsService],
})
export class PostsModule {}
