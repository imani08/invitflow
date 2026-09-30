import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { requiredEnv } from './env.js';

export type VerifiedIdentity = {
  subject: string;
  email?: string;
  name?: string;
};

type AuthenticatedRequest = FastifyRequest & { identity?: VerifiedIdentity };

@Injectable()
export class IdentityGuard implements CanActivate {
  private readonly issuer = requiredEnv('KEYCLOAK_ISSUER_URL').replace(/\/$/, '');
  private readonly clientId = process.env['KEYCLOAK_CLIENT_ID'] ?? 'invitaflow-web';
  private readonly audience = process.env['KEYCLOAK_AUDIENCE'] ?? 'profile-api';
  private readonly jwks = createRemoteJWKSet(new URL(requiredEnv('KEYCLOAK_JWKS_URL')));

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length > 8192) {
      throw new UnauthorizedException();
    }

    try {
      const token = header.slice('Bearer '.length);
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['RS256'],
        maxTokenAge: '10m',
      });
      if (typeof payload['sub'] !== 'string' || payload['azp'] !== this.clientId || payload['email_verified'] !== true) {
        throw new UnauthorizedException();
      }
      const email = typeof payload['email'] === 'string' ? payload['email'].toLowerCase() : undefined;
      const name = typeof payload['name'] === 'string' ? payload['name'].trim().slice(0, 100) : undefined;
      request.identity = {
        subject: payload['sub'],
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired identity token');
    }
  }
}
