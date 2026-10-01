import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { IdentityGuard, type VerifiedIdentity } from './identity.guard.js';
import { PrismaService } from './prisma.service.js';

type AuthenticatedRequest = FastifyRequest & { identity: VerifiedIdentity };
type UpdateProfile = { displayName?: unknown; locale?: unknown };

@Controller('/v1/me')
@UseGuards(IdentityGuard)
export class ProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getMine(@Req() request: AuthenticatedRequest) {
    const identity = request.identity;
    const select = {
      id: true,
      email: true,
      displayName: true,
      locale: true,
      createdAt: true,
      updatedAt: true,
    } as const;
    const existing = await this.prisma.profile.findUnique({
      where: { identitySubject: identity.subject },
      select,
    });
    if (existing) {
      if (identity.email && identity.email !== existing.email) {
        return this.prisma.profile.update({
          where: { identitySubject: identity.subject },
          data: { email: identity.email },
          select,
        });
      }
      return existing;
    }

    try {
      return await this.prisma.profile.create({
        data: {
          identitySubject: identity.subject,
          email: identity.email ?? null,
          displayName: identity.name ?? null,
        },
        select,
      });
    } catch (error) {
      const concurrentlyCreated = await this.prisma.profile.findUnique({
        where: { identitySubject: identity.subject },
        select,
      });
      if (concurrentlyCreated) return concurrentlyCreated;
      throw error;
    }
  }

  @Get('/deletion-request')
  async getDeletionRequest(@Req() request: AuthenticatedRequest) {
    const row = await this.prisma.accountDeletionRequest.findFirst({
      where: { identitySubject: request.identity.subject },
      orderBy: { requestedAt: 'desc' },
      select: { id: true, status: true, requestedAt: true, cancelledAt: true, completedAt: true },
    });
    return { request: row };
  }

  @Post('/deletion-request')
  async requestDeletion(@Req() request: AuthenticatedRequest) {
    const identitySubject = request.identity.subject;
    const current = await this.prisma.accountDeletionRequest.findFirst({
      where: { identitySubject },
      orderBy: { requestedAt: 'desc' },
    });
    if (current?.status === 'PENDING' || current?.status === 'COMPLETED') {
      return { request: this.publicDeletionRequest(current) };
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.accountDeletionRequest.create({ data: { identitySubject } });
        await tx.outboxMessage.create({
          data: {
            eventType: 'profile.account_deletion.requested.v1',
            aggregateId: row.id,
            payload: {
              requestId: row.id,
              identitySubject,
              requestedAt: row.requestedAt.toISOString(),
              schemaVersion: 1,
            },
          },
        });
        return row;
      });
      return { request: this.publicDeletionRequest(created) };
    } catch (error) {
      const raced = await this.prisma.accountDeletionRequest.findFirst({
        where: { identitySubject, status: 'PENDING' },
        orderBy: { requestedAt: 'desc' },
      });
      if (raced) return { request: this.publicDeletionRequest(raced) };
      throw error;
    }
  }

  @Delete('/deletion-request')
  async cancelDeletion(@Req() request: AuthenticatedRequest) {
    const identitySubject = request.identity.subject;
    const current = await this.prisma.accountDeletionRequest.findFirst({
      where: { identitySubject, status: 'PENDING' },
      orderBy: { requestedAt: 'desc' },
    });
    if (!current) return { cancelled: false };

    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.accountDeletionRequest.updateMany({
        where: { id: current.id, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      if (!changed.count) return false;
      await tx.outboxMessage.create({
        data: {
          eventType: 'profile.account_deletion.cancelled.v1',
          aggregateId: current.id,
          payload: {
            requestId: current.id,
            identitySubject,
            cancelledAt: new Date().toISOString(),
            schemaVersion: 1,
          },
        },
      });
      return true;
    });
    return { cancelled: result };
  }

  private publicDeletionRequest<
    T extends {
      id: string;
      status: string;
      requestedAt: Date;
      cancelledAt: Date | null;
      completedAt: Date | null;
    },
  >(row: T) {
    return {
      id: row.id,
      status: row.status,
      requestedAt: row.requestedAt,
      cancelledAt: row.cancelledAt,
      completedAt: row.completedAt,
    };
  }

  @Put()
  async updateMine(@Req() request: AuthenticatedRequest, @Body() body: UpdateProfile) {
    const keys = Object.keys(body ?? {});
    if (keys.length === 0 || keys.some((key) => !['displayName', 'locale'].includes(key))) {
      throw new BadRequestException('Only displayName and locale can be updated');
    }
    const data: { displayName?: string; locale?: string } = {};
    if (body['displayName'] !== undefined) {
      if (
        typeof body['displayName'] !== 'string' ||
        body['displayName'].trim().length < 1 ||
        body['displayName'].trim().length > 100
      ) {
        throw new BadRequestException('displayName must contain between 1 and 100 characters');
      }
      data.displayName = body['displayName'].trim();
    }
    if (body['locale'] !== undefined) {
      if (body['locale'] !== 'fr' && body['locale'] !== 'en')
        throw new BadRequestException('locale must be fr or en');
      data.locale = body['locale'];
    }

    const identity = request.identity;
    return this.prisma.profile.upsert({
      where: { identitySubject: identity.subject },
      create: {
        identitySubject: identity.subject,
        email: identity.email ?? null,
        displayName: data.displayName ?? identity.name ?? null,
        ...(data.locale ? { locale: data.locale } : {}),
      },
      update: {
        ...data,
        ...(identity.email ? { email: identity.email } : {}),
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        locale: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
