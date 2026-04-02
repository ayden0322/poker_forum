import { Module } from '@nestjs/common';
import { PushesController } from './pushes.controller';
import { PushesService } from './pushes.service';

@Module({
  controllers: [PushesController],
  providers: [PushesService],
})
export class PushesModule {}
