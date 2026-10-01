import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProfileExport, parseProfileForExport } from './profile-export.mjs';

const profile = {
  id: 'internal-id',
  email: 'person@example.test',
  displayName: 'Personne',
  locale: 'fr',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
  privateToken: 'must-not-export',
};

test('selects only canonical profile fields for export', () => {
  assert.deepEqual(parseProfileForExport(profile), {
    email: 'person@example.test',
    displayName: 'Personne',
    locale: 'fr',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  });
});

test('rejects malformed profile records and timestamps', () => {
  assert.equal(parseProfileForExport(null), null);
  assert.equal(parseProfileForExport({ ...profile, locale: 'es' }), null);
  assert.equal(parseProfileForExport({ ...profile, createdAt: 'not-a-date' }), null);
});

test('does not expose extra profile properties in the exported object', () => {
  const exported = parseProfileForExport(profile);
  assert.ok(exported);
  assert.equal('id' in exported, false);
  assert.equal('privateToken' in exported, false);
});

test('builds a versioned profile-only export manifest with canonical fields', () => {
  assert.deepEqual(buildProfileExport(profile, '2026-09-30T12:00:00.000Z'), {
    format: 'invitaflow-profile-export-v1',
    exportedAt: '2026-09-30T12:00:00.000Z',
    scope: 'profile',
    includedData: ['profile.email', 'profile.displayName', 'profile.locale', 'profile.createdAt', 'profile.updatedAt'],
    profile: {
      email: 'person@example.test',
      displayName: 'Personne',
      locale: 'fr',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-02T10:00:00.000Z',
    },
  });
  assert.equal(buildProfileExport(profile, 'invalid-date'), null);
  assert.equal(buildProfileExport({ ...profile, locale: 'unsupported' }, '2026-09-30T12:00:00.000Z'), null);
});
