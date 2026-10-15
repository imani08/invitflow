type KeycloakUser = { id?: unknown; email?: unknown; emailVerified?: unknown; enabled?: unknown };

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export class KeycloakDirectory {
  private token: string | null = null;
  private expiresAt = 0;
  private readonly baseUrl = (process.env['KEYCLOAK_INTERNAL_URL'] ?? 'http://keycloak:8080').replace(/\/$/, '');
  private readonly realm = process.env['KEYCLOAK_REALM'] ?? 'invitaflow-dev';

  private async accessToken() {
    if (this.token && Date.now() < this.expiresAt) return this.token;
    const username = process.env['KEYCLOAK_ADMIN'];
    const password = process.env['KEYCLOAK_ADMIN_PASSWORD'];
    if (!username || !password) throw new Error('Keycloak directory credentials are not configured');
    const response = await fetch(`${this.baseUrl}/realms/master/protocol/openid-connect/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username, password }), signal: AbortSignal.timeout(8_000),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== 'object' || typeof (body as Record<string, unknown>)['access_token'] !== 'string') throw new Error('Keycloak directory authentication failed');
    this.token = (body as Record<string, unknown>)['access_token'] as string;
    const expires = Number((body as Record<string, unknown>)['expires_in']);
    this.expiresAt = Date.now() + Math.max(30, Number.isFinite(expires) ? expires - 30 : 30) * 1_000;
    return this.token;
  }

  private email(user: KeycloakUser): string | null {
    return user.enabled !== false && user.emailVerified === true && typeof user.email === 'string' && user.email.length <= 320 && emailPattern.test(user.email)
      ? user.email.toLowerCase() : null;
  }

  async emailForSubject(subject: string): Promise<string | null> {
    if (!/^[0-9a-f-]{36}$/i.test(subject)) return null;
    const response = await fetch(`${this.baseUrl}/admin/realms/${encodeURIComponent(this.realm)}/users/${encodeURIComponent(subject)}`, { headers: { authorization: `Bearer ${await this.accessToken()}` }, signal: AbortSignal.timeout(8_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Keycloak directory lookup failed');
    return this.email(await response.json() as KeycloakUser);
  }

  async allVerifiedUsers(): Promise<Array<{ subject: string; email: string }>> {
    const users: Array<{ subject: string; email: string }> = [];
    for (let first = 0; ; first += 100) {
      const response = await fetch(`${this.baseUrl}/admin/realms/${encodeURIComponent(this.realm)}/users?${new URLSearchParams({ first: String(first), max: '100', briefRepresentation: 'true' })}`, { headers: { authorization: `Bearer ${await this.accessToken()}` }, signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error('Keycloak directory listing failed');
      const page: unknown = await response.json();
      if (!Array.isArray(page)) throw new Error('Keycloak directory response is invalid');
      for (const user of page) {
        if (!user || typeof user !== 'object') continue;
        const record = user as KeycloakUser;
        const email = this.email(record);
        if (email && typeof record.id === 'string' && /^[0-9a-f-]{36}$/i.test(record.id)) users.push({ subject: record.id, email });
      }
      if (page.length < 100) return users;
    }
  }
}
