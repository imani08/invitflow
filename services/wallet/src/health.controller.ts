import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('/health') health() { return this.live(); }
  @Get('/health/live') live() { return { status: 'ok', service: 'wallet', timestamp: new Date().toISOString() }; }
  @Get('/health/ready') ready() { return { status: 'ok', service: 'wallet', timestamp: new Date().toISOString() }; }
}
