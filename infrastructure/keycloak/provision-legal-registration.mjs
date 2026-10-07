const baseUrl = process.env['KEYCLOAK_INTERNAL_URL'] ?? 'http://keycloak:8080';
const adminUsername = process.env['KEYCLOAK_ADMIN'];
const adminPassword = process.env['KEYCLOAK_ADMIN_PASSWORD'];
if (!adminUsername || !adminPassword) throw new Error('Keycloak bootstrap administrator credentials are required');

let token;
let tokenError;
for (let attempt = 0; attempt < 30 && !token; attempt++) {
  try {
    const response = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: adminUsername, password: adminPassword }),
      signal: AbortSignal.timeout(8_000),
    });
    if (response.ok) token = (await response.json()).access_token;
    else tokenError = `Keycloak token endpoint returned ${response.status}`;
  } catch (error) { tokenError = error instanceof Error ? error.message : String(error); }
  if (!token) await new Promise((resolve) => setTimeout(resolve, 2_000));
}
if (!token) throw new Error(`Could not authenticate to Keycloak admin API: ${tokenError}`);
const realmUrl = `${baseUrl}/admin/realms/invitaflow-dev`;

async function admin(path, options = {}) {
  for (let attempt = 0; attempt < 30; attempt++) {
    let response;
    try {
      response = await fetch(`${realmUrl}${path}`, {
        ...options,
        headers: { authorization: `Bearer ${token}`, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      if (attempt >= 29) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      continue;
    }
    if (!response.ok) {
      const body = await response.text();
      if (attempt < 29 && (response.status === 404 || response.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        continue;
      }
      throw new Error(`Keycloak registration-flow setup failed (${response.status}): ${body.slice(0, 400)}`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  throw new Error('Keycloak registration-flow setup timed out');
}

const customAlias = 'InvitaFlow Registration';
let flows = await admin('/authentication/flows');
let customFlow = flows.find((flow) => flow.alias === customAlias);
if (!customFlow) {
  if (!flows.some((flow) => flow.alias === 'registration')) throw new Error('The built-in registration flow is missing');
  await admin('/authentication/flows/registration/copy', { method: 'POST', body: JSON.stringify({ newName: customAlias }) });
  flows = await admin('/authentication/flows');
  customFlow = flows.find((flow) => flow.alias === customAlias);
}
if (!customFlow?.id) throw new Error('The InvitaFlow registration flow was not created');

const visited = new Set();
async function findRegistrationForm(alias) {
  if (visited.has(alias)) return null;
  visited.add(alias);
  const executions = await admin(`/authentication/flows/${encodeURIComponent(alias)}/executions`);
  const userCreation = executions.find((execution) => execution.providerId === 'registration-user-creation');
  if (userCreation) return { alias, executions, userCreation };
  for (const execution of executions.filter((item) => item.authenticationFlow && item.alias)) {
    const found = await findRegistrationForm(execution.alias);
    if (found) return found;
  }
  return null;
}

const registrationForm = await findRegistrationForm(customAlias);
if (!registrationForm) throw new Error('Could not find Registration User Creation in the copied registration flow');
const legalExecution = registrationForm.executions.find((execution) => execution.providerId === 'invitaflow-legal-acceptance');
if (!legalExecution) {
  await admin(`/authentication/flows/${encodeURIComponent(registrationForm.alias)}/executions/execution`, {
    method: 'POST',
    body: JSON.stringify({ provider: 'invitaflow-legal-acceptance', priority: registrationForm.userCreation.priority + 1 }),
  });
} else if (legalExecution.requirement !== 'REQUIRED') {
  await admin(`/authentication/flows/${encodeURIComponent(registrationForm.alias)}/executions`, {
    method: 'PUT',
    body: JSON.stringify({ id: legalExecution.id, requirement: 'REQUIRED', priority: legalExecution.priority }),
  });
}

const realm = await admin('');
if (realm.registrationFlow !== customAlias) {
  realm.registrationFlow = customAlias;
  await admin('', { method: 'PUT', body: JSON.stringify(realm) });
}
process.stdout.write('InvitaFlow registration flow now requires versioned legal acceptance.\n');
