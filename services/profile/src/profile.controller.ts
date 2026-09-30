import { BadRequestException, Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
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
    const select = { id: true, email: true, displayName: true, locale: true, createdAt: true, updatedAt: true } as const;
    const existing = await this.prisma.profile.findUnique({ where: { identitySubject: identity.subject }, select });
    if (existing) {
      if (identity.email && identity.email !== existing.email) {
        return this.prisma.profile.update({ where: { identitySubject: identity.subject }, data: { email: identity.email }, select });
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
      const concurrentlyCreated = await this.prisma.profile.findUnique({ where: { identitySubject: identity.subject }, select });
      if (concurrentlyCreated) return concurrentlyCreated;
      throw error;
    }
  }

  @Put()
  async updateMine(@Req() request: AuthenticatedRequest, @Body() body: UpdateProfile) {
    const keys = Object.keys(body ?? {});
    if (keys.length === 0 || keys.some((key) => !['displayName', 'locale'].includes(key))) {
      throw new BadRequestException('Only displayName and locale can be updated');
    }
    const data: { displayName?: string; locale?: string } = {};
    if (body['displayName'] !== undefined) {
      if (typeof body['displayName'] !== 'string' || body['displayName'].trim().length < 1 || body['displayName'].trim().length > 100) {
        throw new BadRequestException('displayName must contain between 1 and 100 characters');
      }
      data.displayName = body['displayName'].trim();
    }
    if (body['locale'] !== undefined) {
      if (body['locale'] !== 'fr' && body['locale'] !== 'en') throw new BadRequestException('locale must be fr or en');
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
      select: { id: true, email: true, displayName: true, locale: true, createdAt: true, updatedAt: true },
    });
  }
}
