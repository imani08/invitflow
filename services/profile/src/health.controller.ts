import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Controller('/health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('/live')
  live() { return { status: 'ok', service: 'profile', timestamp: new Date().toISOString() }; }

  @Get('/ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', service: 'profile', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', service: 'profile' });
    }
  }
}
