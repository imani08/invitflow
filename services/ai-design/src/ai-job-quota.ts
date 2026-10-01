export type AiQuotaLimits = {
  activePerOwner: number;
  activeGlobal: number;
  requestsPerHourPerOwner: number;
};

export type AiQuotaUsage = {
  activeOwner: number;
  activeGlobal: number;
  requestsLastHour: number;
};

export type AiQuotaRejection = 'OWNER_ACTIVE' | 'GLOBAL_ACTIVE' | 'OWNER_RATE';

export function aiQuotaRejection(usage: AiQuotaUsage, limits: AiQuotaLimits): AiQuotaRejection | null {
  if (usage.activeOwner >= limits.activePerOwner) return 'OWNER_ACTIVE';
  if (usage.activeGlobal >= limits.activeGlobal) return 'GLOBAL_ACTIVE';
  if (usage.requestsLastHour >= limits.requestsPerHourPerOwner) return 'OWNER_RATE';
  return null;
}

export function aiActiveQuotaRejection(
  usage: Pick<AiQuotaUsage, 'activeOwner' | 'activeGlobal'>,
  limits: Pick<AiQuotaLimits, 'activePerOwner' | 'activeGlobal'>,
): Exclude<AiQuotaRejection, 'OWNER_RATE'> | null {
  if (usage.activeOwner >= limits.activePerOwner) return 'OWNER_ACTIVE';
  if (usage.activeGlobal >= limits.activeGlobal) return 'GLOBAL_ACTIVE';
  return null;
}
