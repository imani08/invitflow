export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function validatedPort(): number {
  const value = Number(process.env['PORT'] ?? '3004');
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('PORT must be a valid TCP port');
  return value;
}
