const realmName = 'invitaflow-dev';

export const ROLE_SCOPE_MAPPERS = [
  {
    name: 'realm roles',
    protocol: 'openid-connect',
    protocolMapper: 'oidc-usermodel-realm-role-mapper',
    consentRequired: false,
    config: {
      'user.attribute': 'foo',
      'introspection.token.claim': 'true',
      'access.token.claim': 'true',
      'claim.name': 'realm_access.roles',
      'jsonType.label': 'String',
      multivalued: 'true',
    },
  },
  {
    name: 'client roles',
    protocol: 'openid-connect',
    protocolMapper: 'oidc-usermodel-client-role-mapper',
    consentRequired: false,
    config: {
      'user.attribute': 'foo',
      'introspection.token.claim': 'true',
      'access.token.claim': 'true',
      'claim.name': 'resource_access.${client_id}.roles',
      'jsonType.label': 'String',
      multivalued: 'true',
    },
  },
  {
    name: 'audience resolve',
    protocol: 'openid-connect',
    protocolMapper: 'oidc-audience-resolve-mapper',
    consentRequired: false,
    config: {
      'introspection.token.claim': 'true',
      'access.token.claim': 'true',
    },
  },
];

const CLIENT_IDS = ['invitaflow-web', 'invitaflow-admin'];

function mapperMatches(actual, expected) {
  return (
    actual.protocol === expected.protocol &&
    actual.protocolMapper === expected.protocolMapper &&
    actual.consentRequired === expected.consentRequired &&
    Object.entries(expected.config).every(([key, value]) => actual.config?.[key] === value)
  );
}

export async function provisionRoleScopes(admin, log = () => {}) {
  let scopes = await admin('/client-scopes');
  let scope = scopes.find((candidate) => candidate.name === 'roles');
  let scopeStatus = 'already present';
  if (!scope) {
    await admin('/client-scopes', {
      method: 'POST',
      body: JSON.stringify({
        name: 'roles',
        description: 'Standard Keycloak role and audience claims',
        protocol: 'openid-connect',
        attributes: {
          'include.in.token.scope': 'false',
          'display.on.consent.screen': 'false',
        },
      }),
    });
    scopes = await admin('/client-scopes');
    scope = scopes.find((candidate) => candidate.name === 'roles');
    scopeStatus = 'created';
  }
  if (!scope?.id) throw new Error('Keycloak client scope roles could not be resolved');
  log(`Keycloak client scope roles: ${scopeStatus}`);

  const mapperPath = `/client-scopes/${encodeURIComponent(scope.id)}/protocol-mappers/models`;
  let mappers = await admin(mapperPath);
  for (const expected of ROLE_SCOPE_MAPPERS) {
    const existing = mappers.find((candidate) => candidate.name === expected.name);
    if (!existing) {
      await admin(mapperPath, { method: 'POST', body: JSON.stringify(expected) });
      mappers = [...mappers, expected];
      log(`Keycloak roles mapper ${expected.name}: created`);
      continue;
    }
    if (mapperMatches(existing, expected)) {
      log(`Keycloak roles mapper ${expected.name}: already present`);
      continue;
    }
    if (!existing.id) throw new Error(`Keycloak roles mapper ${expected.name} has no resolvable ID`);
    await admin(`${mapperPath}/${encodeURIComponent(existing.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ ...existing, ...expected, id: existing.id }),
    });
    mappers = mappers.map((candidate) => (candidate.id === existing.id ? { ...existing, ...expected } : candidate));
    log(`Keycloak roles mapper ${expected.name}: updated`);
  }

  for (const clientId of CLIENT_IDS) {
    const matches = await admin(`/clients?clientId=${encodeURIComponent(clientId)}`);
    const client = matches.find((candidate) => candidate.clientId === clientId);
    if (!client?.id) throw new Error(`Keycloak client ${clientId} was not found`);
    const defaults = await admin(`/clients/${encodeURIComponent(client.id)}/default-client-scopes`);
    if (defaults.some((candidate) => candidate.id === scope.id)) {
      log(`Keycloak default scope roles for ${clientId}: already present`);
      continue;
    }
    await admin(`/clients/${encodeURIComponent(client.id)}/default-client-scopes/${encodeURIComponent(scope.id)}`, {
      method: 'PUT',
    });
    log(`Keycloak default scope roles for ${clientId}: attached`);
  }
}

async function runProvisioner() {
  const baseUrl = process.env['KEYCLOAK_INTERNAL_URL'] ?? 'http://keycloak:8080';
  const adminUsername = process.env['KEYCLOAK_ADMIN'];
  const adminPassword = process.env['KEYCLOAK_ADMIN_PASSWORD'];
  if (!adminUsername || !adminPassword)
    throw new Error('Keycloak bootstrap administrator credentials are required');

  const tokenResponse = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: adminUsername,
      password: adminPassword,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!tokenResponse.ok) throw new Error('Could not authenticate to Keycloak admin API');
  const token = (await tokenResponse.json()).access_token;
  const realmUrl = `${baseUrl}/admin/realms/${encodeURIComponent(realmName)}`;

  async function admin(path, options = {}) {
    const response = await fetch(`${realmUrl}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok && response.status !== 409)
      throw new Error(`Keycloak role-scope setup failed (${response.status})`);
    return response.status === 201 || response.status === 204 || response.status === 409
      ? null
      : response.json();
  }

  await provisionRoleScopes(admin, (message) => process.stdout.write(`${message}\n`));
  process.stdout.write('Keycloak role scopes provisioned.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runProvisioner().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Keycloak role-scope setup failed'}\n`);
    process.exitCode = 1;
  });
}
import { pathToFileURL } from 'node:url';
