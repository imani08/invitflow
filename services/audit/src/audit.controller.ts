import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from './identity.guard.js';
import { IdentityGuard, SupportAdminGuard } from './identity.guard.js';
import { AuditService } from './audit.service.js';

@Controller('/v1/admin/audit-events')
@UseGuards(IdentityGuard, SupportAdminGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get() list(@Req() _request: AuthenticatedRequest, @Query('limit') limit?: string, @Query('cursor') cursor?: string, @Query('eventType') eventType?: string, @Query('actorSubject') actorSubject?: string) { return this.audit.list({ ...(limit !== undefined ? { limit } : {}), ...(cursor !== undefined ? { cursor } : {}), ...(eventType !== undefined ? { eventType } : {}), ...(actorSubject !== undefined ? { actorSubject } : {}) }); }
}

@Controller('/v1/moderation/reports')
@UseGuards(IdentityGuard)
export class ModerationReportController {
  constructor(private readonly audit: AuditService) {}
  @Post() create(@Req() request: AuthenticatedRequest, @Headers('idempotency-key') key: string, @Body() body: unknown) { return this.audit.createReport(request.identity!.subject, key, body); }
}

@Controller('/v1/admin/moderation-reports')
@UseGuards(IdentityGuard, SupportAdminGuard)
export class AdminModerationController {
  constructor(private readonly audit: AuditService) {}
  @Get() list(@Query('status') status?: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) { return this.audit.listReports({ ...(status !== undefined ? { status } : {}), ...(limit !== undefined ? { limit } : {}), ...(cursor !== undefined ? { cursor } : {}) }); }
  @Patch('/:reportId') review(@Req() request: AuthenticatedRequest, @Param('reportId') id: string, @Body() body: unknown) { return this.audit.reviewReport(request.identity!.subject, id, body); }
}
