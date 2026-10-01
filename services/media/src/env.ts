import { BadRequestException } from '@nestjs/common';

export function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function validatedPort(): number {
  const value = Number(requiredEnv('PORT', '3014'));
  if (!Number.isInteger(value) || value < 1 || value > 65535)
    throw new Error('PORT must be a valid TCP port');
  return value;
}

export function validatedServicePort(name: string, fallback: number): number {
  const raw = process.env[name] ?? String(fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65_535)
    throw new Error(`${name} must be a valid TCP port`);
  return value;
}

export function uuid(value: string, label: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`${label} invalide.`);
  }
  return value;
}
