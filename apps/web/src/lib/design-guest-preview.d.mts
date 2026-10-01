export function resolveGuestPreviewValues(
  variables: { key: string; label: string; defaultValue: string }[],
  guest: { fullName: string } | null,
): Record<string, string>;
