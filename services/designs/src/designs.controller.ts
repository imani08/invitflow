import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './identity.guard.js';
import { IdentityGuard } from './identity.guard.js';
import { DesignsService } from './designs.service.js';

function authorization(request: AuthenticatedRequest) {
  return request.headers['authorization'] as string;
}

@Controller('/v1/events/:eventId/designs')
@UseGuards(IdentityGuard)
export class DesignsController {
  constructor(private readonly designs: DesignsService) {}

  @Get('/templates') templates(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query('category') category?: string,
  ) {
    return this.designs.listTemplates(eventId, authorization(request), category);
  }

  @Post('/composer/proposals') composerProposals(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    return this.designs.composerProposals(eventId, request.identity!.subject, authorization(request), body);
  }

  @Post('/composer/select') selectComposition(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    return this.designs.selectComposed(eventId, request.identity!.subject, authorization(request), body);
  }

  @Get('/templates/:templateId') template(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.designs.getTemplate(eventId, authorization(request), templateId);
  }

  @Get() list(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.designs.list(
      eventId,
      request.identity!.subject,
      authorization(request),
      includeArchived === 'true',
    );
  }

  @Post() create(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    return this.designs.create(eventId, request.identity!.subject, authorization(request), body);
  }

  @Get('/:designId/versions') versions(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('designId') designId: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.designs.listVersions(
      eventId,
      request.identity!.subject,
      authorization(request),
      designId,
      includeArchived === 'true',
    );
  }

  @Post('/:designId/restore') restore(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('designId') designId: string,
    @Body() body: unknown,
  ) {
    return this.designs.restore(
      eventId,
      request.identity!.subject,
      authorization(request),
      designId,
      body,
    );
  }

  @Post('/:designId/validate') async validate(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('designId') designId: string,
  ) {
    const design = await this.designs.get(
      eventId,
      request.identity!.subject,
      authorization(request),
      designId,
    );
    return { ...this.designs.inspectDocument(design.document), editorial: await this.designs.editorialContext(eventId, request.identity!.subject, authorization(request), designId) };
  }

  @Get('/:designId') get(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('designId') designId: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.designs.get(
      eventId,
      request.identity!.subject,
      authorization(request),
      designId,
      includeArchived === 'true',
    );
  }

  @Put('/:designId') update(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('designId') designId: string,
    @Body() body: unknown,
  ) {
    return this.designs.update(
      eventId,
      request.identity!.subject,
      authorization(request),
      designId,
      body,
    );
  }

  @Delete('/:designId') archive(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('designId') designId: string,
  ) {
    return this.designs.archive(
      eventId,
      request.identity!.subject,
      authorization(request),
      designId,
    );
  }
}
