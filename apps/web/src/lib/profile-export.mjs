const isDateString = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function parseProfileForExport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const profile = value;
  if (!(profile.email === null || typeof profile.email === 'string')) return null;
  if (!(profile.displayName === null || typeof profile.displayName === 'string')) return null;
  if (profile.locale !== 'fr' && profile.locale !== 'en') return null;
  if (!isDateString(profile.createdAt) || !isDateString(profile.updatedAt)) return null;
  return {
    email: profile.email,
    displayName: profile.displayName,
    locale: profile.locale,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function buildProfileExport(profileValue, exportedAt) {
  const profile = parseProfileForExport(profileValue);
  if (!profile || typeof exportedAt !== 'string' || !Number.isFinite(Date.parse(exportedAt))) return null;
  return {
    format: 'invitaflow-profile-export-v1',
    exportedAt,
    scope: 'profile',
    includedData: ['profile.email', 'profile.displayName', 'profile.locale', 'profile.createdAt', 'profile.updatedAt'],
    profile,
  };
}
