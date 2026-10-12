// Explicit, idempotent repair for a definitions-only RabbitMQ bootstrap.
// Existing passwords/accounts/messages are never replaced or removed.
import { execFileSync } from 'node:child_process';

const docker = (...args) => execFileSync('docker', args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
});
const environment = service => {
  const id = docker('compose', 'ps', '-q', service).trim();
  if (!id) throw new Error('Required service is not running');
  const container = JSON.parse(docker('inspect', id))[0];
  return Object.fromEntries(container.Config.Env.map(value => {
    const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)];
  }));
};
try {
  const broker = environment('rabbitmq');
  const user = broker.RABBITMQ_DEFAULT_USER, password = broker.RABBITMQ_DEFAULT_PASS;
  if (!user || !password) throw new Error('Missing existing broker configuration');
  for (const service of ['invitations', 'wallet', 'designs']) {
    const env = environment(service);
    if (env.RABBITMQ_USER !== user || env.RABBITMQ_PASSWORD !== password)
      throw new Error('Application and broker configuration differ');
  }
  const ctl = (...args) => docker('compose', 'exec', '-T', 'rabbitmq', 'rabbitmqctl', ...args);
  const users = JSON.parse(ctl('list_users', '--formatter', 'json'));
  const existing = users.find(value => value.user === user);
  if (!existing) ctl('add_user', user, password);
  else ctl('authenticate_user', user, password);
  // management enables the HTTP API, without granting administrator access.
  const tags = existing?.tags ?? [];
  if (!tags.includes('management') && !tags.includes('administrator'))
    ctl('set_user_tags', user, ...tags, 'management');
  const resources = '^(invitaflow\\.|invitation\\.|ai-design\\.|wallet\\.|agencies\\.|notifications\\.|analytics\\.|billing\\.|payments\\.|media\\.|audit\\.).*';
  // Default exchange is needed only for delivery to named retry queues.
  const write = '^(amq\\.default|)$|' + resources;
  ctl('set_permissions', '-p', '/', user, resources, write, resources);
  console.log(JSON.stringify({ user, vhost: '/', account: existing ? 'verified' : 'created', permissions: 'InvitaFlow resources only', administratorGranted: false }));
} catch {
  // child_process errors contain argv; never print them because credentials
  // are supplied directly to rabbitmqctl, without shell interpolation.
  console.error('RabbitMQ provisioning failed; raw credentials and command output withheld. Check account/configuration consistency.');
  process.exitCode = 1;
}
