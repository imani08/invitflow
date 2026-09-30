export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function validatedPort(): number {
  const port = Number(process.env['PORT'] ?? '3005');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  return port;
}

export function maxImportBytes() {
  const value = Number(process.env['MAX_GUEST_IMPORT_BYTES'] ?? 5 * 1024 * 1024);
  if (!Number.isInteger(value) || value < 1024 || value > 5 * 1024 * 1024) throw new Error('MAX_GUEST_IMPORT_BYTES must be between 1 KiB and 5 MiB');
  return value;
}
