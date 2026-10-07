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

process.stdout.write(`Parent flow: ${customFlow.id} ${customFlow.alias} ${customFlow.providerId ?? '(providerId unavailable)'}\n`);

const visited = new Set();
process.stdout.write(`Legal registration parent flow: ${customAlias}\n`);
const parentExecutions = await admin(`/authentication/flows/${encodeURIComponent(customAlias)}/executions`);
// The full catalog is only a fallback when an execution omits flowId.
flows = await admin('/authentication/flows');

async function resolveChildFlow(execution) {
  const flowId = execution.flowId ?? execution.subFlowId;
  if (flowId) {
    try {
      // Keycloak 26.7.4 supports resolving the AuthenticationFlowRepresentation
      // directly by id; treat this response as authoritative.
      return await admin(`/authentication/flows/${encodeURIComponent(flowId)}`);
    } catch (error) {
      if (execution.flowId) throw error;
    }
  }

  // Older representations may omit flowId. Resolve only against structural
  // catalog fields first; displayName is the last-resort fallback.
  const aliasReference = execution.alias;
  const byAlias = aliasReference ? flows.find((flow) => flow.alias === aliasReference || flow.id === aliasReference) : null;
  if (byAlias) return byAlias;
  const displayReference = execution.displayName;
  return displayReference ? flows.find((flow) => flow.alias === displayReference || flow.id === displayReference) ?? null : null;
}

async function findRegistrationFormFlow(parentAlias) {
  if (visited.has(parentAlias)) return null;
  visited.add(parentAlias);

  const executions = parentAlias === customAlias
    ? parentExecutions
    : await admin(`/authentication/flows/${encodeURIComponent(parentAlias)}/executions`);
  for (const execution of executions.filter((item) => item.authenticationFlow === true)) {
    process.stdout.write(`Child flow execution: ${execution.flowId ?? '(no flowId)'} ${execution.displayName ?? '(no display name)'}\n`);
    const child = await resolveChildFlow(execution);
    process.stdout.write(`Resolved child flow: ${child?.id ?? '(unknown id)'} ${child?.alias ?? '(unknown alias)'} ${child?.providerId ?? '(unresolved providerId)'}\n`);
    if (!child?.alias) continue;

    if (child.providerId === 'form-flow') {
      const childExecutions = await admin(`/authentication/flows/${encodeURIComponent(child.alias)}/executions`);
      process.stdout.write(`Executions for ${child.alias}:\n`);
      for (const item of childExecutions) {
        process.stdout.write(`  ${item.displayName ?? '(no display name)'} | ${item.authenticator ?? '(no authenticator)'} | ${item.providerId ?? '(no providerId)'} | ${item.requirement ?? '(no requirement)'}\n`);
      }
      const userCreation = childExecutions.find((item) =>
        [item.providerId, item.authenticator].some((provider) => provider === 'registration-user-creation')
        || /registration\s+user\s+creation/i.test(item.displayName ?? ''));
      if (userCreation) return { id: child.id, alias: child.alias, executions: childExecutions, userCreation };
    }

    const nested = await findRegistrationFormFlow(child.alias);
    if (nested) return nested;
  }
  return null;
}

const registrationForm = await findRegistrationFormFlow(customAlias);
if (!registrationForm?.id || !registrationForm.alias) throw new Error('Could not find the registration form subflow containing Registration User Creation');
process.stdout.write(`Registration form flow: ${registrationForm.id} ${registrationForm.alias} ${'form-flow'}\n`);
for (const execution of registrationForm.executions) {
  process.stdout.write(`Registration form execution: ${execution.displayName ?? '(no display name)'} | ${execution.providerId ?? execution.authenticator ?? '(no provider/authenticator)'} | ${execution.requirement ?? '(no requirement)'} | ${execution.priority ?? '(no priority)'}\n`);
}

const legalExecution = registrationForm.executions.find((execution) =>
  execution.providerId === 'invitaflow-legal-acceptance' || execution.authenticator === 'invitaflow-legal-acceptance');
let legalExecutionState = 'already present';
if (!legalExecution) {
  await admin(`/authentication/flows/${encodeURIComponent(registrationForm.alias)}/executions/execution`, {
    method: 'POST',
    body: JSON.stringify({ provider: 'invitaflow-legal-acceptance' }),
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
if (configuredLegalExecution.requirement !== 'REQUIRED' || configuredLegalExecution.priority <= registrationForm.userCreation.priority) {
  await admin(`/authentication/flows/${encodeURIComponent(registrationForm.alias)}/executions`, {
    method: 'PUT',
    body: JSON.stringify({ id: configuredLegalExecution.id, requirement: 'REQUIRED', priority: requiredPriority }),
  });
}
const finalExecutions = await admin(`/authentication/flows/${encodeURIComponent(registrationForm.alias)}/executions`);
const finalLegalExecution = finalExecutions.find((execution) =>
  execution.providerId === 'invitaflow-legal-acceptance' || execution.authenticator === 'invitaflow-legal-acceptance');
if (!finalLegalExecution || finalLegalExecution.requirement !== 'REQUIRED' || finalLegalExecution.priority <= registrationForm.userCreation.priority) {
  throw new Error('Legal execution must be REQUIRED and ordered after registration-user-creation');
}
process.stdout.write(`Legal action: ${legalExecutionState}\n`);
process.stdout.write(`Final legal requirement: ${finalLegalExecution.requirement}; priority ${finalLegalExecution.priority} after registration-user-creation priority ${registrationForm.userCreation.priority}\n`);

const realm = await admin('');
if (realm.registrationFlow !== customAlias) {
  realm.registrationFlow = customAlias;
  await admin('', { method: 'PUT', body: JSON.stringify(realm) });
}
process.stdout.write(`Final registration binding: ${realm.registrationFlow}\n`);
