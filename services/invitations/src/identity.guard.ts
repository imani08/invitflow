import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { requiredEnv } from './env.js';
export type AuthenticatedRequest = FastifyRequest & { identity?: { subject: string } };
@Injectable()
export class IdentityGuard implements CanActivate {
  private readonly issuer = requiredEnv('KEYCLOAK_ISSUER_URL').replace(/\/$/, '');
  private readonly jwks = createRemoteJWKSet(new URL(requiredEnv('KEYCLOAK_JWKS_URL')));
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>(); const authorization = req.headers['authorization'];
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ') || authorization.length > 8192) throw new UnauthorizedException();
    try { const { payload } = await jwtVerify(authorization.slice(7), this.jwks, { issuer: this.issuer, audience: process.env['KEYCLOAK_AUDIENCE'] ?? 'invitations-api', algorithms: ['RS256'], maxTokenAge: '10m' });
      if (typeof payload['sub'] !== 'string' || payload['azp'] !== (process.env['KEYCLOAK_CLIENT_ID'] ?? 'invitaflow-web') || payload['email_verified'] !== true) throw new Error();
      req.identity = { subject: payload['sub'] }; return true;
    } catch { throw new UnauthorizedException('Invalid or expired identity token'); }
  }
}
