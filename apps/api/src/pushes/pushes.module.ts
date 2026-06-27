import { Module } from '@nestjs/common';
import { PushesController } from './pushes.controller';
import { PushesService } from './pushes.service';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [PushesController],
  providers: [PushesService],
})
export class PushesModule {}
