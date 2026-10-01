type RedisEvalClient = {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
};

export const REPLACE_SESSION_IF_UNCHANGED: string;
export const DELETE_SESSION_IF_UNCHANGED: string;
export const RELEASE_REFRESH_LOCK_IF_OWNER: string;
export const REFRESH_LOCK_TTL_SECONDS: number;
export function replaceSessionIfUnchanged(client: RedisEvalClient, key: string, previous: string, next: string, ttlSeconds: number): Promise<boolean>;
export function deleteSessionIfUnchanged(client: RedisEvalClient, key: string, previous: string): Promise<boolean>;
export function releaseRefreshLock(client: RedisEvalClient, key: string, ownerToken: string): Promise<boolean>;
export function waitForSessionChange(readSessionValue: () => Promise<string | null>, previous: string, attempts?: number, delayMs?: number): Promise<string | null>;
