import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { ActuatorController } from './actuator.controller';
import { HealthService } from './health.service';

@Module({
  imports: [ConfigModule],
  controllers: [HealthController, ActuatorController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
