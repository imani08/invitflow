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
const realmUrl = `${baseUrl}/admin/realms/invitaflow-dev`;

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
    throw new Error(`Keycloak audience setup failed (${response.status})`);
  return response.status === 201 || response.status === 204 || response.status === 409
    ? null
    : response.json();
}

const clients = await admin('/clients?clientId=invitaflow-web');
const webClient = clients.find((client) => client.clientId === 'invitaflow-web');
if (!webClient?.id) throw new Error('Keycloak web client was not found');
for (const audience of ['media-api', 'access-api']) {
  let scopes = await admin('/client-scopes');
  let scope = scopes.find((item) => item.name === audience);
  if (!scope) {
    const created = await admin('/client-scopes', {
      method: 'POST',
      body: JSON.stringify({
        name: audience,
        description: `Audience for the InvitaFlow ${audience === 'media-api' ? 'Media' : 'Access'} Service`,
        protocol: 'openid-connect',
        attributes: { 'include.in.token.scope': 'true', 'display.on.consent.screen': 'false' },
      }),
    });
    if (created) throw new Error(`Unexpected Keycloak response creating ${audience}`);
    scopes = await admin('/client-scopes');
    scope = scopes.find((item) => item.name === audience);
  }
  if (!scope?.id) throw new Error(`Keycloak ${audience} scope is unavailable after provisioning`);
  const mappers = await admin(`/client-scopes/${encodeURIComponent(scope.id)}/protocol-mappers/models`);
  const mapperName = `${audience}-audience`;
  if (!mappers.some((mapper) => mapper.name === mapperName)) {
    await admin(`/client-scopes/${encodeURIComponent(scope.id)}/protocol-mappers/models`, {
      method: 'POST',
      body: JSON.stringify({
        name: mapperName,
        protocol: 'openid-connect',
        protocolMapper: 'oidc-audience-mapper',
        consentRequired: false,
        config: { 'included.client.audience': audience, 'id.token.claim': 'false', 'access.token.claim': 'true', 'introspection.token.claim': 'true' },
      }),
    });
  }
  const defaults = await admin(`/clients/${encodeURIComponent(webClient.id)}/default-client-scopes`);
  if (!defaults.some((item) => item.id === scope.id))
    await admin(`/clients/${encodeURIComponent(webClient.id)}/default-client-scopes/${encodeURIComponent(scope.id)}`, { method: 'PUT' });
}

process.stdout.write('Keycloak media and access audiences provisioned.\n');
