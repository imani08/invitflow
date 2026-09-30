import { ServiceUnavailableException } from '@nestjs/common';
export function requiredEnv(name: string, fallback?: string) { const value = process.env[name] ?? fallback; if (!value) throw new ServiceUnavailableException(`${name} is not configured`); return value; }
export function validatedPort() { const port = Number(process.env['PORT'] ?? 3013); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port'); return port; }
