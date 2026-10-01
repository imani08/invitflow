import { BadRequestException } from '@nestjs/common';

export function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function validatedPort(): number {
  const value = Number(requiredEnv('PORT', '3008'));
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('PORT must be a valid TCP port');
  return value;
}

export function uuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new BadRequestException(`${label} invalide.`);
  return value;
}

export type AiJobLimits = {
  activePerOwner: number;
  activeGlobal: number;
  requestsPerHourPerOwner: number;
};

function boundedInteger(name: string, fallback: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

export function aiJobLimits(): AiJobLimits {
  return {
    activePerOwner: boundedInteger('AI_MAX_ACTIVE_PER_OWNER', 2, 100),
    activeGlobal: boundedInteger('AI_MAX_ACTIVE_GLOBAL', 20, 10_000),
    requestsPerHourPerOwner: boundedInteger('AI_MAX_REQUESTS_PER_HOUR_PER_OWNER', 10, 10_000),
  };
}
