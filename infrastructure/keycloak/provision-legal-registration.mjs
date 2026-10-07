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
async function findRegistrationFormFlow(alias) {
  if (visited.has(alias)) return null;
  visited.add(alias);

  const executions = await admin(`/authentication/flows/${encodeURIComponent(alias)}/executions`);
  for (const execution of executions.filter((item) => item.authenticationFlow === true)) {
    // The execution alias points to the child flow. Resolve it from the flow
    // catalog, then verify its structural provider type instead of using its
    // translated display name (which can vary by Keycloak version/locale).
    const child = flows.find((flow) => flow.alias === execution.alias)
      ?? (execution.alias ? await admin(`/authentication/flows/${encodeURIComponent(execution.alias)}`) : null);
    if (child?.providerId === 'form-flow') {
      const childExecutions = await admin(`/authentication/flows/${encodeURIComponent(child.alias)}/executions`);
      const userCreation = childExecutions.find((item) => item.providerId === 'registration-user-creation');
      if (userCreation) return { id: child.id, alias: child.alias, executions: childExecutions, userCreation };
    }

    if (execution.alias) {
      const nested = await findRegistrationFormFlow(execution.alias);
      if (nested) return nested;
    }
  }
  return null;
}

process.stdout.write(`Legal registration parent flow: ${customAlias}\n`);
const registrationForm = await findRegistrationFormFlow(customAlias);
if (!registrationForm?.id || !registrationForm.alias) throw new Error('Could not find the registration form subflow containing Registration User Creation');
process.stdout.write(`Registration form flow: ${registrationForm.alias}\n`);
process.stdout.write('Provider found: invitaflow-legal-acceptance\n');

const legalExecution = registrationForm.executions.find((execution) =>
  execution.providerId === 'invitaflow-legal-acceptance' || execution.authenticator === 'invitaflow-legal-acceptance');
let legalExecutionState = 'already present';
if (!legalExecution) {
  await admin(`/authentication/flows/${encodeURIComponent(registrationForm.alias)}/executions/execution`, {
    method: 'POST',
    body: JSON.stringify({ provider: 'invitaflow-legal-acceptance', priority: registrationForm.userCreation.priority + 1 }),
  });
  legalExecutionState = 'created';
}

// Read back after creation as Keycloak assigns the execution id and may apply
// a default requirement. Keep the action REQUIRED and immediately after user creation.
const updatedExecutions = await admin(`/authentication/flows/${encodeURIComponent(registrationForm.alias)}/executions`);
const configuredLegalExecution = updatedExecutions.find((execution) =>
  execution.providerId === 'invitaflow-legal-acceptance' || execution.authenticator === 'invitaflow-legal-acceptance');
if (!configuredLegalExecution?.id) throw new Error('Keycloak did not create the legal acceptance execution');
const requiredPriority = registrationForm.userCreation.priority + 1;
if (configuredLegalExecution.requirement !== 'REQUIRED' || configuredLegalExecution.priority !== requiredPriority) {
  await admin(`/authentication/flows/${encodeURIComponent(registrationForm.alias)}/executions`, {
    method: 'PUT',
    body: JSON.stringify({ id: configuredLegalExecution.id, requirement: 'REQUIRED', priority: requiredPriority }),
  });
}
process.stdout.write(`Legal execution: ${legalExecutionState}\n`);

const realm = await admin('');
if (realm.registrationFlow !== customAlias) {
  realm.registrationFlow = customAlias;
  await admin('', { method: 'PUT', body: JSON.stringify(realm) });
}
process.stdout.write(`Registration flow binding: ${realm.registrationFlow}\n`);
