import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LangfuseService } from '../../services/langfuse.service';
import { DatasetManagerService } from '../../services/dataset-manager.service';
import { LangfuseController } from './langfuse.controller';

@Module({
  imports: [ConfigModule],
  controllers: [LangfuseController],
  providers: [LangfuseService, DatasetManagerService],
  exports: [LangfuseService, DatasetManagerService],
})
export class LangfuseModule {}
