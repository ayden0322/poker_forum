import { Module } from '@nestjs/common';
import { FriendliesService } from './friendlies.service';
import { FriendliesController } from './friendlies.controller';
import { FriendliesCron } from './friendlies.cron';

@Module({
  controllers: [FriendliesController],
  providers: [FriendliesService, FriendliesCron],
  exports: [FriendliesService],
})
export class FriendliesModule {}
