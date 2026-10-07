import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { provisionRoleScopes, ROLE_SCOPE_MAPPERS } from './provision-role-scopes.mjs';

const realm = JSON.parse(await readFile(new URL('./realm-export.json', import.meta.url), 'utf8'));
const compose = await readFile(new URL('../../compose.yaml', import.meta.url), 'utf8');
const provisionerSource = await readFile(new URL('./provision-role-scopes.mjs', import.meta.url), 'utf8');

test('realm export defines the default roles scope with standard role and audience mappers', () => {
  const scope = realm.clientScopes.find((item) => item.name === 'roles');
  assert.ok(scope);
  assert.equal(scope.protocol, 'openid-connect');
  assert.deepEqual(scope.protocolMappers.map(({ name, protocolMapper }) => ({ name, protocolMapper })), ROLE_SCOPE_MAPPERS.map(({ name, protocolMapper }) => ({ name, protocolMapper })));
  const realmMapper = scope.protocolMappers.find((mapper) => mapper.name === 'realm roles');
  assert.equal(realmMapper.config['claim.name'], 'realm_access.roles');
  assert.equal(realmMapper.config['user.attribute'], 'foo');
  assert.equal(realmMapper.config['access.token.claim'], 'true');
  assert.equal(realmMapper.config['introspection.token.claim'], 'true');
  assert.equal(realmMapper.config['jsonType.label'], 'String');
  assert.equal(realmMapper.config.multivalued, 'true');
  for (const clientId of ['invitaflow-web', 'invitaflow-admin']) {
    const client = realm.clients.find((item) => item.clientId === clientId);
    assert.ok(client);
    assert.ok(client.defaultClientScopes.includes('roles'));
  }
});

test('provisioner repairs missing and malformed scope resources and is idempotent', async () => {
  const store = {
    scopes: [],
    mappers: [],
    clients: [{ id: 'runtime-client-web', clientId: 'invitaflow-web' }, { id: 'runtime-client-admin', clientId: 'invitaflow-admin' }],
    defaults: { 'runtime-client-web': [{ id: 'existing-profile-scope', name: 'profile' }], 'runtime-client-admin': [] },
  };
  const writes = [];
  let nextId = 1;
  async function admin(path, options = {}) {
    const method = options.method ?? 'GET';
    const payload = options.body ? JSON.parse(options.body) : null;
    writes.push({ path, method, payload });
    if (path === '/client-scopes' && method === 'GET') return store.scopes;
    if (path === '/client-scopes' && method === 'POST') {
      store.scopes.push({ ...payload, id: `runtime-scope-${nextId++}` });
      return null;
    }
    const mapperMatch = /^\/client-scopes\/([^/]+)\/protocol-mappers\/models(?:\/([^/]+))?$/.exec(path);
    if (mapperMatch) {
      const [, scopeId, mapperId] = mapperMatch;
      assert.equal(store.scopes[0].id, decodeURIComponent(scopeId));
      if (method === 'GET') return store.mappers;
      if (method === 'POST') { store.mappers.push({ ...payload, id: `runtime-mapper-${nextId++}` }); return null; }
      if (method === 'PUT') { store.mappers = store.mappers.map((item) => item.id === decodeURIComponent(mapperId) ? payload : item); return null; }
    }
    const clientMatch = /^\/clients\?clientId=(.+)$/.exec(path);
    if (clientMatch && method === 'GET') return store.clients.filter((item) => item.clientId === decodeURIComponent(clientMatch[1]));
    const defaultsMatch = /^\/clients\/([^/]+)\/default-client-scopes(?:\/([^/]+))?$/.exec(path);
    if (defaultsMatch) {
      const [, clientId, scopeId] = defaultsMatch;
      const key = decodeURIComponent(clientId);
      if (method === 'GET') return store.defaults[key];
      if (method === 'PUT') { store.defaults[key].push({ id: decodeURIComponent(scopeId), name: 'roles' }); return null; }
    }
    throw new Error(`Unexpected mocked Keycloak request: ${method} ${path}`);
  }

  await provisionRoleScopes(admin);
  assert.equal(store.scopes.length, 1);
  assert.equal(store.mappers.length, 3);
  assert.equal(store.defaults['runtime-client-web'].length, 2);
  assert.equal(store.defaults['runtime-client-admin'].length, 1);
  assert.equal(writes.filter((entry) => entry.method === 'POST' && entry.path === '/client-scopes').length, 1);
  const writeCount = writes.length;
  await provisionRoleScopes(admin);
  assert.equal(writes.slice(writeCount).filter((entry) => entry.method === 'POST' || entry.method === 'PUT').length, 0);
  assert.equal(store.mappers.length, 3);
  assert.equal(writes.some((entry) => /\/users(?:\/|\?|$)/.test(entry.path)), false);
});

test('existing mapper configuration is repaired in place without hard-coded runtime IDs or user promotion', async () => {
  assert.equal(provisionerSource.includes('SUPER_ADMIN'), false);
  assert.equal(provisionerSource.includes('imani'), false);
  assert.equal(provisionerSource.includes('550e8400-e29b-41d4-a716-446655440000'), false);
  const definition = ROLE_SCOPE_MAPPERS.find((mapper) => mapper.name === 'realm roles');
  assert.ok(definition);
  const scope = { id: 'scope-id-from-runtime', name: 'roles' };
  let actual = { id: 'mapper-id-from-runtime', name: definition.name, protocol: definition.protocol, protocolMapper: 'wrong-mapper', consentRequired: false, config: { 'claim.name': 'wrong.claim' } };
  const remainingMappers = ROLE_SCOPE_MAPPERS.filter((mapper) => mapper.name !== definition.name).map((mapper, index) => ({ ...mapper, id: `existing-mapper-${index}` }));
  let updated = false;
  const admin = async (path, options = {}) => {
    if (path === '/client-scopes') return [scope];
    if (/\/protocol-mappers\/models$/.test(path)) return [actual, ...remainingMappers];
    if (path.endsWith('/mapper-id-from-runtime') && options.method === 'PUT') { actual = JSON.parse(options.body); updated = true; return null; }
    if (path.startsWith('/clients?clientId=')) {
      const clientId = decodeURIComponent(path.split('=')[1]);
      return [{ id: `${clientId}-runtime-id`, clientId }];
    }
    if (path.endsWith('/default-client-scopes')) return [{ id: scope.id }];
    throw new Error(`Unexpected request in mapper repair test: ${path}`);
  };
  await provisionRoleScopes(admin);
  assert.equal(updated, true);
  assert.equal(actual.protocolMapper, definition.protocolMapper);
  assert.equal(actual.config['claim.name'], 'realm_access.roles');
  assert.equal(updated, true);
});

test('Compose runs role-scope setup as a one-shot job before the web service', () => {
  assert.match(compose, /keycloak-role-scope-init:[\s\S]*?restart: 'no'/);
  assert.match(compose, /keycloak-role-scope-init:[\s\S]*?condition: service_healthy/);
  assert.match(compose, /keycloak-role-scope-init:[\s\S]*?networks: \[identity\]/);
  const webService = compose.slice(compose.indexOf('\n  web:\n'));
  assert.match(webService, /keycloak-role-scope-init:[\s\S]*?condition: service_completed_successfully/);
});
