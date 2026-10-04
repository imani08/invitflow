import { Controller, ForbiddenException, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard.js';
import { MediaService } from './media.service.js';
import { requiredEnv } from './env.js';

@Controller('/v1/admin/storage')
@UseGuards(IdentityGuard)
export class MediaStorageAdminController {
  constructor(private readonly media: MediaService) {}

  @Get()
  getStats(@Req() request: FastifyRequest) {
    const roles = (request as AuthenticatedRequest).identity?.roles ?? [];
    if (!roles.some((role) => role === 'SUPER_ADMIN' || role === 'SUPPORT_ADMIN'))
      throw new ForbiddenException('Permission d’administration requise.');
    return this.media.getAdminStorageStats();
  }

  @Post('/refresh')
  refresh(@Req() request: FastifyRequest) {
    const identity = (request as AuthenticatedRequest).identity;
    if (!identity?.roles.some((role) => role === 'SUPER_ADMIN' || role === 'SUPPORT_ADMIN'))
      throw new ForbiddenException('Permission d’administration requise.');
    return this.media.refreshMinioInventory(identity.subject);
  }
}

@Controller('/v1/internal/storage/capacity')
export class MediaStorageCapacityController {
  constructor(private readonly media: MediaService) {}

  @Get()
  getCapacity(@Headers('x-storage-monitor-token') token?: string) {
    const expected = Buffer.from(requiredEnv('STORAGE_MONITOR_TOKEN'));
    const received = Buffer.from(token ?? '');
    if (expected.length !== received.length || !timingSafeEqual(expected, received))
      throw new ForbiddenException();
    return this.media.storageCapacityStatus();
  }
}
