import { mkdir, chmod, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';

export async function createPostgresBackup(outputPath, spawnProcess = spawn) {
  const output = resolve(outputPath);
  await mkdir(dirname(output), { recursive: true });
  const child = spawnProcess('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-lc', 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dumpall --clean --if-exists --username "$POSTGRES_USER"'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const outputStream = createWriteStream(output, { flags: 'wx', mode: 0o600 });
  let outputCreated = false;
  outputStream.once('open', () => { outputCreated = true; });
  const exit = new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', resolveExit);
  });
  try {
    await pipeline(child.stdout, outputStream);
    const code = await exit;
    if (code !== 0) throw new Error(`pg_dumpall exited with ${code}`);
    await chmod(output, 0o600);
    return output;
  } catch (error) {
    child.kill();
    if (outputCreated) await rm(output, { force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(process.argv[2] ?? `backups/postgres-${new Date().toISOString().replaceAll(':', '-')}.sql`);
  const saved = await createPostgresBackup(output);
  console.log(`PostgreSQL cluster backup written to ${saved}`);
}
