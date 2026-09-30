import { Controller, Get } from '@nestjs/common';

@Controller('/health')
export class HealthController {
  @Get() live() { return this.ready(); }
  @Get('/live') liveStatus() { return this.ready(); }
  @Get('/ready') ready() { return { status: 'ok', service: 'payments', timestamp: new Date().toISOString() }; }
}
