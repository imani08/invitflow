import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const presented = request.headers['x-service-token'];
    const expected = process.env['INVITATIONS_INTERNAL_TOKEN'];
    if (typeof presented !== 'string' || !expected || expected.length < 32 || presented.length > 512) throw new UnauthorizedException();
    const a = createHash('sha256').update(presented).digest();
    const b = createHash('sha256').update(expected).digest();
    if (!timingSafeEqual(a, b)) throw new UnauthorizedException();
    return true;
  }
}
