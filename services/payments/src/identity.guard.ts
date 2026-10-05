import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { requiredEnv } from './env.js';

export type PaymentIdentity = { subject: string; email: string; name: string; roles: string[] };
export type AuthenticatedRequest = FastifyRequest & { identity?: PaymentIdentity };

@Injectable()
export class IdentityGuard implements CanActivate {
  private readonly issuer = requiredEnv('KEYCLOAK_ISSUER_URL').replace(/\/$/, '');
  private readonly clientId = process.env['KEYCLOAK_CLIENT_ID'] ?? 'invitaflow-web';
  private readonly audience = process.env['KEYCLOAK_AUDIENCE'] ?? 'payments-api';
  private readonly jwks = createRemoteJWKSet(new URL(requiredEnv('KEYCLOAK_JWKS_URL')));

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length > 8192) throw new UnauthorizedException();
    try {
      const { payload } = await jwtVerify(header.slice(7), this.jwks, { issuer: this.issuer, audience: this.audience, algorithms: ['RS256'], maxTokenAge: '10m' });
      if (typeof payload['sub'] !== 'string' || payload['azp'] !== this.clientId || payload['email_verified'] !== true || typeof payload['email'] !== 'string') throw new Error('Invalid identity claims');
      const access = payload['realm_access'];
      const roles = access && typeof access === 'object' && 'roles' in access && Array.isArray(access.roles) ? access.roles.filter((role): role is string => typeof role === 'string') : [];
      const names = [payload['given_name'], payload['family_name']].filter((value): value is string => typeof value === 'string' && !!value.trim());
      const claimedName = typeof payload['name'] === 'string' && payload['name'].trim() ? payload['name'].trim() : names.join(' ');
      request.identity = { subject: payload['sub'], email: payload['email'].toLowerCase(), name: claimedName.slice(0, 120), roles };
      return true;
    } catch { throw new UnauthorizedException('Invalid or expired identity token'); }
  }
}

@Injectable()
export class FinanceAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.identity?.roles.some((role) => role === 'FINANCE_ADMIN' || role === 'SUPER_ADMIN')) throw new ForbiddenException('Permission financière requise.');
    return true;
  }
}
