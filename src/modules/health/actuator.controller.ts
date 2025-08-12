import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('actuator')
@Controller({ path: 'rgt-expense/actuator/health', version: '' })
export class ActuatorController {
  @Get('liveness')
  @ApiOperation({
    summary: 'Liveness health check',
    description: 'Simple liveness probe for container orchestration systems like Kubernetes'
  })
  @ApiResponse({
    status: 200,
    description: 'Service is alive',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'UP' },
        timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' }
      }
    }
  })
  async getLiveness(): Promise<{ status: string; timestamp: string }> {
    return {
      status: 'UP',
      timestamp: new Date().toISOString()
    };
  }
}
