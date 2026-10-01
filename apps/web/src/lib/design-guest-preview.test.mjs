import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGuestPreviewValues } from './design-guest-preview.mjs';

test('uses the selected real guest for guest-name variables and keeps event defaults', () => {
  const variables = [
    { key: 'guestName', label: "Nom de l'invité", defaultValue: 'Invité' },
    { key: 'eventDate', label: 'Date', defaultValue: 'Date à confirmer' },
    { key: 'coupleNames', label: 'Noms du couple', defaultValue: 'Les mariés' },
  ];

  assert.deepEqual(resolveGuestPreviewValues(variables, { fullName: 'Sarah Ilunga' }), {
    guestName: 'Sarah Ilunga',
    eventDate: 'Date à confirmer',
    coupleNames: 'Les mariés',
  });
});

test('uses model defaults when no guest is selected', () => {
  const variables = [{ key: 'guest_name', label: 'Guest name', defaultValue: 'Guest' }];
  assert.deepEqual(resolveGuestPreviewValues(variables, null), { guest_name: 'Guest' });
});
