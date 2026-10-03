import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import AppNavbar from '@/components/AppNavbar';
import { NotificationInbox } from './notification-inbox';
import './notifications.css';

type Notification = { id: string; category: string; title: string; message: string; createdAt: string; readAt: string | null; data: Record<string, string> };
type Inbox = { items: Notification[]; unreadCount: number; nextCursor: string | null };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const store = await cookies();
  const session = await getSession(store.get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Faccount%2Fnotifications');
  let response: Response; let preferencesResponse: Response;
  try {
    const gateway = process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002';
    [response, preferencesResponse] = await Promise.all([
      fetch(`${gateway}/v1/notifications?limit=50`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
      fetch(`${gateway}/v1/notifications/preferences`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
    ]);
  } catch { return <Unavailable />; }
  if (response.status === 401 || preferencesResponse.status === 401) redirect('/api/auth/login?returnTo=%2Faccount%2Fnotifications');
  if (!response.ok || !preferencesResponse.ok) return <Unavailable />;
  const inbox = await response.json() as Inbox;
  const preferences = await preferencesResponse.json() as { enabled: boolean };
  if (!Array.isArray(inbox.items) || !Number.isSafeInteger(inbox.unreadCount) || typeof preferences.enabled !== 'boolean') return <Unavailable />;
  return <main className="notifications-page"><AppNavbar />
    <header className="notifications-heading"><span className="eyebrow">VOTRE ESPACE</span><h1>Notifications</h1><p>Les confirmations et mises à jour importantes de vos événements apparaissent ici.</p></header>
    <NotificationInbox initial={inbox} initialEnabled={preferences.enabled} />
  </main>;
}

function Unavailable() {
  return <main className="notifications-page"><AppNavbar /><section className="notifications-unavailable"><h1>Notifications momentanément indisponibles</h1><p>Réessayez dans quelques instants.</p><a href="/account/notifications">Réessayer</a></section></main>;
}
