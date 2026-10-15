import { decodeJwt } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { AnnouncementForm } from './announcement-form';

export const dynamic = 'force-dynamic';

export default async function AnnouncementsPage() {
  const session = await getSession((await cookies()).get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Fadmin%2Fannouncements');
  let allowed = false;
  try {
    const access = decodeJwt(session.accessToken)['realm_access'];
    allowed = !!(access && typeof access === 'object' && 'roles' in access && Array.isArray(access.roles) && access.roles.includes('SUPER_ADMIN'));
  } catch { /* The API repeats the authorization check. */ }
  if (!allowed) return <main className="admin-shell"><section className="admin-denied"><span>ACCÈS RESTREINT</span><h1>Permission Super Admin requise</h1><p>Seule l’administration complète peut envoyer une annonce à l’ensemble des utilisateurs.</p></section></main>;
  return <main className="admin-shell"><header><span>ADMINISTRATION</span><h1>Annonces e-mail</h1><p>Communiquez une information importante à l’ensemble des utilisateurs vérifiés d’InvitaFlow.</p></header><AnnouncementForm /></main>;
}
