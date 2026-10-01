import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseIsolatedPostgresTarget } from './postgres-restore-target.mjs';

test('accepts an explicit remote PostgreSQL target without returning credentials', () => {
  const target = parseIsolatedPostgresTarget('postgresql://restore_admin:sensitive@restore-drill.example:5432/recovery_db?sslmode=require');
  assert.deepEqual(target, { hostname: 'restore-drill.example', database: 'recovery_db' });
});

test('rejects non-PostgreSQL URLs and incomplete targets', () => {
  assert.throws(() => parseIsolatedPostgresTarget('https://admin:secret@db.example/recovery'), /postgres/);
  assert.throws(() => parseIsolatedPostgresTarget('postgres://admin:secret@db.example/'), /explicit/);
  assert.throws(() => parseIsolatedPostgresTarget('postgres://admin:secret@db.example/a/b'), /database name/);
});

test('rejects the active Compose database and loopback hosts', () => {
  assert.throws(() => parseIsolatedPostgresTarget('postgres://admin:secret@postgres/recovery'), /active Compose/);
  assert.throws(() => parseIsolatedPostgresTarget('postgres://admin:secret@localhost/recovery'), /local host/);
  assert.throws(() => parseIsolatedPostgresTarget('postgres://admin:secret@127.0.0.1/recovery'), /local host/);
  assert.throws(() => parseIsolatedPostgresTarget('postgres://admin:secret@restore-drill.example/recovery?host=postgres'), /override/);
});
