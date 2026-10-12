// Explicit integration test. No application container is started by this script.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const output = resolve('coverage/runtime-pdf');
mkdirSync(output, { recursive: true });
const container = JSON.parse(execFileSync('docker', ['inspect', 'invitaflow-wallet-1'], { encoding: 'utf8' }))[0];
const env = Object.fromEntries(container.Config.Env.map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)]; }));
if (!env.DATABASE_URL) throw new Error('Existing Wallet database configuration unavailable');
const fixture = readFileSync(new URL('./invitation-pdf-runtime-fixture.mjs', import.meta.url), 'utf8');
const sourceBatch = process.argv[2];
if (sourceBatch && !/^[0-9a-f-]{36}$/i.test(sourceBatch)) throw new Error('Invalid source batch ID');
const service = process.argv[3] ?? 'invitations';
if (!['invitations', 'rendering'].includes(service)) throw new Error('Invalid diagnostic service');
const input = `process.env.TEST_WALLET_DATABASE_URL=${JSON.stringify(env.DATABASE_URL)};\nprocess.env.TEST_SOURCE_BATCH=${JSON.stringify(sourceBatch ?? '')};\n` + fixture;
try {
  process.stdout.write(execFileSync('docker', ['compose', 'run', '--rm', '--no-deps', '-T',
    '--volume', `${resolve('services/wallet/dist')}:/app/test-wallet:ro`,
    '--volume', `${output}:/test-output`, '--entrypoint', 'node', service, '--input-type=module'],
  { input, encoding: 'utf8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] }));
} catch (error) {
  if (error.stdout) process.stdout.write(error.stdout);
  throw new Error('Isolated PDF runtime check failed; credentials and raw stderr withheld');
}
