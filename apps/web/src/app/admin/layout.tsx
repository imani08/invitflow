import { decodeJwt } from 'jose';
import { cookies } from 'next/headers';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { AdminShell } from '@/components/admin/admin-shell';
import './admin.css';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession((await cookies()).get(sessionCookieName())?.value);
  let roles: string[] = [];
  if (session) {
    try {
      const access = decodeJwt(session.accessToken)['realm_access'];
      roles = access && typeof access === 'object' && 'roles' in access && Array.isArray(access.roles)
        ? access.roles.filter((role): role is string => typeof role === 'string')
        : [];
    } catch {
      // Each route and API keeps its existing independent access checks.
    }
  }

  return <AdminShell roles={roles}>{children}</AdminShell>;
}
