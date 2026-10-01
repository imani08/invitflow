export type ExportableProfile = {
  email: string | null;
  displayName: string | null;
  locale: 'fr' | 'en';
  createdAt: string;
  updatedAt: string;
};

export function parseProfileForExport(value: unknown): ExportableProfile | null;
export function buildProfileExport(profile: unknown, exportedAt: unknown): {
  format: 'invitaflow-profile-export-v1';
  exportedAt: string;
  scope: 'profile';
  includedData: string[];
  profile: ExportableProfile;
} | null;
