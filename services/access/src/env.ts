import { ServiceUnavailableException } from '@nestjs/common';

export function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new ServiceUnavailableException(`${name} is not configured`);
  return value;
}

export function validatedPort(): number {
  const port = Number(requiredEnv('PORT', '3017'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  return port;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
