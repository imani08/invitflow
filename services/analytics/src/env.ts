import { ServiceUnavailableException } from '@nestjs/common';

export function requiredEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new ServiceUnavailableException(`${name} is not configured`);
  return value;
}

export function validatedPort() {
  const value = Number(process.env['PORT'] ?? 3016);
  if (!Number.isInteger(value) || value < 1 || value > 65_535)
    throw new Error('PORT must be a valid TCP port');
  return value;
}
