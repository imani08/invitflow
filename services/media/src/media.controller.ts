import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { uuid } from './env.js';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard.js';
import { MediaService } from './media.service.js';

@Controller('v1/assets')
@UseGuards(IdentityGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(
    @Req() request: FastifyRequest,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.media.listAssets(
      (request as AuthenticatedRequest).identity!.subject,
      limit,
      cursor,
    );
  }

  @Post()
  create(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.media.createAsset((request as AuthenticatedRequest).identity!.subject, body);
  }

  @Get(':assetId')
  get(@Req() request: FastifyRequest, @Param('assetId') assetId: string) {
    return this.media.getAsset(
      (request as AuthenticatedRequest).identity!.subject,
      uuid(assetId, 'assetId'),
    );
  }

  @Post(':assetId/upload-url')
  uploadUrl(@Req() request: FastifyRequest, @Param('assetId') assetId: string) {
    return this.media.createUploadUrl(
      (request as AuthenticatedRequest).identity!.subject,
      uuid(assetId, 'assetId'),
    );
  }

  @Post(':assetId/complete')
  complete(@Req() request: FastifyRequest, @Param('assetId') assetId: string) {
    return this.media.completeUpload(
      (request as AuthenticatedRequest).identity!.subject,
      uuid(assetId, 'assetId'),
    );
  }

  @Post(':assetId/download-url')
  downloadUrl(
    @Req() request: FastifyRequest,
    @Param('assetId') assetId: string,
    @Query('variant') variant?: string,
  ) {
    return this.media.createDownloadUrl(
      (request as AuthenticatedRequest).identity!.subject,
      uuid(assetId, 'assetId'),
      variant,
    );
  }

  @Delete(':assetId')
  delete(@Req() request: FastifyRequest, @Param('assetId') assetId: string) {
    return this.media.deleteAsset(
      (request as AuthenticatedRequest).identity!.subject,
      uuid(assetId, 'assetId'),
    );
  }
}
