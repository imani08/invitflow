import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postgresRestoreCommandArgs } from './postgres-restore-command.mjs';

test('the restore URL is inherited by name and never embedded in Docker arguments', () => {
  const args = postgresRestoreCommandArgs();
  assert.deepEqual(args.slice(0, 6), ['compose', 'exec', '-T', '-e', 'RESTORE_TARGET_URL', 'postgres']);
  assert.ok(!args.some((argument) => argument.startsWith('RESTORE_TARGET_URL=')));
});
