export class AccountExportError extends Error {
  code: string;
  status: number;
}

export function collectAccountExport(options: {
  accessToken: string;
  gateway: string;
  exportedAt?: string;
  fetcher?: typeof fetch;
}): Promise<Record<string, unknown>>;
