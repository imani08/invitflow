export function resolveGuestPreviewValues(
  variables: { key: string; label: string; defaultValue: string }[],
  guest: { fullName: string } | null,
  context?: { tableName?: string },
): Record<string, string>;
