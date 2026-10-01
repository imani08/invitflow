import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createPostgresBackup } from './backup-postgres.mjs';

function fakeSpawn(contents, exitCode = 0) {
  return () => {
    const child = new EventEmitter();
    child.stdout = Readable.from([Buffer.from(contents)]);
    child.kill = () => {};
    setImmediate(() => child.emit('close', exitCode));
    return child;
  };
}

test('a backup refuses an existing path without deleting its contents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'invitaflow-backup-'));
  const target = join(directory, 'existing.sql');
  try {
    await writeFile(target, 'preserve this backup');
    await assert.rejects(createPostgresBackup(target, fakeSpawn('new dump')), { code: 'EEXIST' });
    assert.equal(await readFile(target, 'utf8'), 'preserve this backup');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a failed dump removes the incomplete file created by that attempt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'invitaflow-backup-'));
  const target = join(directory, 'failed.sql');
  try {
    await assert.rejects(createPostgresBackup(target, fakeSpawn('partial dump', 1)), /pg_dumpall exited with 1/);
    await assert.rejects(readFile(target), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
