import { BadRequestException, CanActivate, Controller, ExecutionContext, Injectable, Post, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DesignsService } from './designs.service.js';

@Injectable()
export class StorageMonitorGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const presented = request.headers['x-storage-monitor-token'];
    const expected = process.env['STORAGE_MONITOR_TOKEN'];
    if (typeof presented !== 'string' || !expected || expected.length < 32 || presented.length > 512) throw new UnauthorizedException();
    if (!timingSafeEqual(createHash('sha256').update(presented).digest(), createHash('sha256').update(expected).digest())) throw new UnauthorizedException();
    return true;
  }
}

@Controller('/v1/internal/storage')
@UseGuards(StorageMonitorGuard)
export class StorageReferenceController {
  constructor(private readonly designs: DesignsService) {}

  @Post('/template-asset-check')
  templateAssetCheck(@Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid asset query.');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).length !== 1 || typeof input['assetId'] !== 'string' || !/^[0-9a-f-]{36}$/i.test(input['assetId'])) throw new BadRequestException('Invalid asset query.');
    return this.designs.checkPublishedTemplateAsset(input['assetId']);
  }

  @Post('/reference-check')
  referenceCheck(@Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid reference query.');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['assetId', 'objectKey'].includes(key)) || typeof input['assetId'] !== 'string' || !/^[0-9a-f-]{36}$/i.test(input['assetId']) || typeof input['objectKey'] !== 'string' || input['objectKey'].length > 500 || !/^assets\/[0-9a-f-]{36}(?:\/(?:preview|thumbnail))?$/i.test(input['objectKey'])) throw new BadRequestException('Invalid reference query.');
    return this.designs.checkStorageReference(input['assetId'], input['objectKey']);
  }
}
