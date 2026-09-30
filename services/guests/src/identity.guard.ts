import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { requiredEnv } from './env.js';

export type VerifiedIdentity = { subject: string; email: string };
export type AuthenticatedRequest = FastifyRequest & { identity?: VerifiedIdentity };

@Injectable()
export class IdentityGuard implements CanActivate {
  private readonly issuer = requiredEnv('KEYCLOAK_ISSUER_URL').replace(/\/$/, '');
  private readonly clientId = process.env['KEYCLOAK_CLIENT_ID'] ?? 'invitaflow-web';
  private readonly audience = process.env['KEYCLOAK_AUDIENCE'] ?? 'guests-api';
  private readonly jwks = createRemoteJWKSet(new URL(requiredEnv('KEYCLOAK_JWKS_URL')));

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length > 8192) throw new UnauthorizedException();
    try {
      const { payload } = await jwtVerify(header.slice(7), this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['RS256'],
        maxTokenAge: '10m',
      });
      if (typeof payload['sub'] !== 'string' || payload['azp'] !== this.clientId || payload['email_verified'] !== true || typeof payload['email'] !== 'string') throw new Error('Invalid identity claims');
      request.identity = { subject: payload['sub'], email: payload['email'].toLowerCase() };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired identity token');
    }
  }
}
