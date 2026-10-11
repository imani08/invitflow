import assert from 'node:assert/strict';
import test from 'node:test';
import { invitationDisplayFields, guestCeremonySnapshots } from '../src/index.mjs';

test('shared invitation display formats UTC records in their actual event/ceremony zone', () => {
  const source = { name: 'Union', timezone: 'Africa/Kinshasa', startAt: '2026-10-10T09:00:00Z', ceremonies: [{ name: 'Civil', startAt: '2026-10-10T09:00:00Z', location: 'Mairie' }] };
  const display = invitationDisplayFields(source);
  assert.equal(display.event.date, '10 octobre 2026'); assert.equal(display.ceremonies[0].time, '10:00'); assert.equal(display.ceremonies[0].venue, 'Mairie');
  assert.equal(source.ceremonies[0].startAt, '2026-10-10T09:00:00Z');
  const paris = invitationDisplayFields({ ...source, ceremonies: [{ timezone: 'Europe/Paris', startAt: '2026-07-10T08:00:00Z' }, { timezone: 'Europe/Paris', startAt: '2026-01-10T09:00:00Z' }] });
  assert.deepEqual(paris.ceremonies.map(ceremony => ceremony.time), ['10:00', '10:00']);
});
test('authored legacy date/time remain intact and missing facts stay empty', () => {
  assert.deepEqual(invitationDisplayFields({}).ceremonies, []);
  assert.equal(invitationDisplayFields({}).event.date, '');
  const result = invitationDisplayFields({ date: 'Samedi 10 octobre', ceremonies: [{ date: '10 octobre', time: '10h00' }] });
  assert.equal(result.event.date, 'Samedi 10 octobre'); assert.equal(result.ceremonies[0].time, '10h00');
});

test('two guests with different ceremony access receive different immutable programme selections', () => {
  const snapshots = ['civil', 'religious', 'reception'].map(id => ({ ceremony: { id } }));
  assert.deepEqual(guestCeremonySnapshots(snapshots, [{ ceremonyId: 'civil', isInvited: true }]), [snapshots[0]]);
  assert.deepEqual(guestCeremonySnapshots(snapshots, [{ ceremonyId: 'reception', isInvited: true }, { ceremonyId: 'civil', isInvited: false }]), [snapshots[2]]);
  assert.deepEqual(guestCeremonySnapshots(snapshots, []), []);
  assert.throws(() => guestCeremonySnapshots(snapshots, undefined), /incomplete/);
  assert.equal(snapshots.length, 3);
});
