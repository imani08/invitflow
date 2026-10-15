import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { requiredEnv } from './env.js';

export type VerifiedIdentity = { subject: string; roles: string[] };
type AuthenticatedRequest = FastifyRequest & { identity?: VerifiedIdentity };

@Injectable()
export class IdentityGuard implements CanActivate {
  private readonly issuer = requiredEnv('KEYCLOAK_ISSUER_URL').replace(/\/$/, '');
  private readonly clientId = process.env['KEYCLOAK_CLIENT_ID'] ?? 'invitaflow-web';
  private readonly audience = process.env['KEYCLOAK_AUDIENCE'] ?? 'notifications-api';
  private readonly jwks = createRemoteJWKSet(new URL(requiredEnv('KEYCLOAK_JWKS_URL')));

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ') || authorization.length > 8192) throw new UnauthorizedException();
    try {
      const { payload } = await jwtVerify(authorization.slice(7), this.jwks, { issuer: this.issuer, audience: this.audience, algorithms: ['RS256'], maxTokenAge: '10m' });
      if (typeof payload['sub'] !== 'string' || payload['azp'] !== this.clientId || payload['email_verified'] !== true) throw new Error('Invalid identity claims');
      const realmAccess = payload['realm_access'];
      const roles = realmAccess && typeof realmAccess === 'object' && 'roles' in realmAccess && Array.isArray(realmAccess.roles)
        ? realmAccess.roles.filter((role): role is string => typeof role === 'string')
        : [];
      request.identity = { subject: payload['sub'], roles };
      return true;
    } catch { throw new UnauthorizedException('Invalid or expired identity token'); }
  }
}
