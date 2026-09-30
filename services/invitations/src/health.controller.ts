import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
@Controller('/health') export class HealthController { constructor(private readonly prisma: PrismaService) {} @Get('/live') live() { return { status: 'ok', service: 'invitations', timestamp: new Date().toISOString() }; } @Get() health() { return this.live(); } @Get('/ready') async ready() { await this.prisma.$queryRaw`SELECT 1`; return this.live(); } }
