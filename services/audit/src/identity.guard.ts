import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { requiredEnv } from './env.js';

export type AuditIdentity = { subject: string; roles: string[] };
export type AuthenticatedRequest = FastifyRequest & { identity?: AuditIdentity };

@Injectable()
export class IdentityGuard implements CanActivate {
  private readonly issuer = requiredEnv('KEYCLOAK_ISSUER_URL').replace(/\/$/, '');
  private readonly clientId = process.env['KEYCLOAK_CLIENT_ID'] ?? 'invitaflow-web';
  private readonly jwks = createRemoteJWKSet(new URL(requiredEnv('KEYCLOAK_JWKS_URL')));
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>(); const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ') || authorization.length > 8192) throw new UnauthorizedException();
    try {
      const { payload } = await jwtVerify(authorization.slice(7), this.jwks, { issuer: this.issuer, audience: process.env['KEYCLOAK_AUDIENCE'] ?? 'admin-api', algorithms: ['RS256'], maxTokenAge: '10m' });
      if (typeof payload['sub'] !== 'string' || payload['azp'] !== this.clientId || payload['email_verified'] !== true) throw new Error();
      const access = payload['realm_access']; const roles = access && typeof access === 'object' && 'roles' in access && Array.isArray(access.roles) ? access.roles.filter((role): role is string => typeof role === 'string') : [];
      request.identity = { subject: payload['sub'], roles }; return true;
    } catch { throw new UnauthorizedException('Invalid or expired identity token'); }
  }
}

@Injectable()
export class SupportAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) { const request = context.switchToHttp().getRequest<AuthenticatedRequest>(); if (!request.identity?.roles.some(role => role === 'SUPPORT_ADMIN' || role === 'SUPER_ADMIN')) throw new ForbiddenException('Permission d’administration requise.'); return true; }
}
