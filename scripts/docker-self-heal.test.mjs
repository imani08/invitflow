import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const watchdog = await readFile(new URL('./docker-self-heal.ps1', import.meta.url), 'utf8');
const installer = await readFile(new URL('./install-docker-self-heal-task.ps1', import.meta.url), 'utf8');
const uninstaller = await readFile(new URL('./uninstall-docker-self-heal-task.ps1', import.meta.url), 'utf8');
const compose = await readFile(new URL('../compose.yaml', import.meta.url), 'utf8');

test('watchdog targets only a fixed long-running allowlist and excludes one-shot provisioning jobs', () => {
  assert.match(watchdog, /\$LongRunningServices = @\([\s\S]*'web'[\s\S]*'postgres'[\s\S]*'traefik'/);
  assert.match(watchdog, /\$OneShotJobs = @\([\s\S]*'minio-bootstrap'[\s\S]*'keycloak-legal-flow-init'[\s\S]*'analytics-db-init'/);
  assert.match(watchdog, /if \(\$OneShotJobs -contains \$service -or \$service -match/);
  assert.match(watchdog, /INTERVENTION_REQUISE/);
  assert.match(watchdog, /\$MaxAttempts = 3/);
  assert.match(watchdog, /\$CooldownMinutes = 60/);
  assert.doesNotMatch(watchdog, /docker compose (?:build|down)|volume rm|migrat(?:e|ion)/i);
});

test('watchdog can only restart or start a stopped service and installer task runs periodically', () => {
  assert.match(watchdog, /docker compose.*\$Arguments/);
  assert.match(watchdog, /@\('restart', \$service\)/);
  assert.match(watchdog, /@\('up', '-d', '--no-deps', \$service\)/);
  assert.match(installer, /RepetitionInterval \(New-TimeSpan -Minutes 5\)/);
  assert.match(uninstaller, /Unregister-ScheduledTask/);
});

test('all Compose long-running services restart unless stopped and init jobs stay one-shot', () => {
  const services = compose.match(/^services:\s*\n([\s\S]*?)(?=^(?:volumes|networks|configs|secrets):|$)/m)?.[1] ?? '';
  const blocks = [...services.matchAll(/^  ([\w.-]+):\s*\n([\s\S]*?)(?=^  [\w.-]+:\s*\n|$)/gm)];
  const longRunning = new Set(['postgres','redis','rabbitmq','minio','clamav','keycloak','mailpit','prometheus','postgres-exporter','redis-exporter','grafana','loki','tempo','otel-collector','web','admin','gateway','audit','profile','events','guests','seating','designs','media','background-removal-provider','background-removal-worker','ai-design','wallet','billing','payments','notifications','analytics','invitations','access','rendering','traefik']);
  for (const [, name, body] of blocks) {
    if (longRunning.has(name)) assert.match(body, /^    restart: unless-stopped\s*$/m, `${name} should restart after unexpected exit`);
    if (/(?:-db-init|-init|-bootstrap|provision)/.test(name)) assert.match(body, /^    restart: 'no'\s*$/m, `${name} should remain one-shot`);
  }
});
