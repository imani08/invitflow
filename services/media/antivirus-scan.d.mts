export class AntivirusScanError extends Error {
  code: string;
}

export function scanWithClamAV(
  bytes: Buffer,
  options: { host: string; port: number; timeoutMs?: number },
): Promise<Readonly<{ clean: true }>>;
