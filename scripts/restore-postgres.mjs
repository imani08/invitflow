import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pipeline } from 'node:stream/promises';
import { postgresRestoreCommandArgs } from './postgres-restore-command.mjs';
import { parseIsolatedPostgresTarget } from './postgres-restore-target.mjs';

const file = resolve(process.argv[2] ?? '');
const targetUrl = process.env['RESTORE_TARGET_URL'];
if (!process.argv[2] || !targetUrl) throw new Error('Usage: RESTORE_TARGET_URL=<isolated superuser PostgreSQL URL> node scripts/restore-postgres.mjs <backup.sql>');
const target = parseIsolatedPostgresTarget(targetUrl);
const prompt = createInterface({ input: process.stdin, output: process.stdout });
const confirmation = await prompt.question(`This will restore cluster roles and databases to ${target.hostname}/${target.database}. Type RESTORE TO ISOLATED TARGET to continue: `);
prompt.close();
if (confirmation !== 'RESTORE TO ISOLATED TARGET') throw new Error('Restore cancelled.');

const child = spawn('docker', postgresRestoreCommandArgs(), { stdio: ['pipe', 'inherit', 'inherit'] });
const exit = new Promise((resolveExit, reject) => {
  child.once('error', reject);
  child.once('close', resolveExit);
});
try {
  await Promise.all([pipeline(createReadStream(file), child.stdin), exit]);
} catch (error) {
  child.kill();
  throw error;
}
const code = await exit;
if (code !== 0) throw new Error(`psql restore exited with ${code}`);
console.log(`PostgreSQL restore completed from ${file}. Run the documented verification queries before accepting the recovery.`);
