import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { requiredEnv } from './env.js';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  private readonly expected = createHash('sha256').update(requiredEnv('WALLET_INTERNAL_TOKEN')).digest();
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const supplied = request.headers['x-service-token'];
    if (typeof supplied !== 'string' || supplied.length > 1024 || !timingSafeEqual(this.expected, createHash('sha256').update(supplied ?? '').digest())) throw new UnauthorizedException();
    return true;
  }
}
