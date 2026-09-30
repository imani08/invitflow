import { Body, Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedRequest } from './identity.guard.js';
import { IdentityGuard } from './identity.guard.js';
import { AiDesignService } from './ai-design.service.js';

function authorization(request: AuthenticatedRequest) {
  return request.headers['authorization'] as string;
}

@Controller('/v1/events/:eventId/designs/:designId/ai-jobs')
@UseGuards(IdentityGuard)
export class AiDesignController {
  constructor(private readonly ai: AiDesignService) {}

  @Get() list(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('designId') designId: string) {
    return this.ai.list(eventId, designId, request.identity!.subject, authorization(request));
  }

  @Post() create(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('designId') designId: string, @Body() body: unknown) {
    return this.ai.create(eventId, designId, request.identity!.subject, authorization(request), body);
  }

  @Get('/:jobId') get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('designId') designId: string, @Param('jobId') jobId: string) {
    return this.ai.get(eventId, designId, jobId, request.identity!.subject, authorization(request));
  }

  @Get('/:jobId/preview') async preview(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('designId') designId: string, @Param('jobId') jobId: string, @Res() reply: FastifyReply) {
    const bytes = await this.ai.preview(eventId, designId, jobId, request.identity!.subject, authorization(request));
    return reply.header('Content-Type', 'image/png').header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').send(bytes);
  }

  @Post('/:jobId/retry') retry(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('designId') designId: string, @Param('jobId') jobId: string) {
    return this.ai.retry(eventId, designId, jobId, request.identity!.subject, authorization(request));
  }

  @Delete('/:jobId') cancel(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('designId') designId: string, @Param('jobId') jobId: string) {
    return this.ai.cancel(eventId, designId, jobId, request.identity!.subject, authorization(request));
  }
}
