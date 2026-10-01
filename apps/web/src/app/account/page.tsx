import Link from 'next/link';
import { cookies } from 'next/headers';
import { decodeJwt } from 'jose';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { ProfileForm } from './profile-form';
import './profile.css';

type Profile = { email: string | null; displayName: string | null; locale: string };

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  return (
    (profile['email'] === null || typeof profile['email'] === 'string') &&
    (profile['displayName'] === null || typeof profile['displayName'] === 'string') &&
    (profile['locale'] === 'fr' || profile['locale'] === 'en')
  );
}

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Faccount');
  let canManagePricing = false;
  try {
    const access = decodeJwt(session.accessToken)['realm_access'];
    const roles =
      access && typeof access === 'object' && 'roles' in access && Array.isArray(access.roles)
        ? access.roles
        : [];
    canManagePricing = roles.includes('FINANCE_ADMIN') || roles.includes('SUPER_ADMIN');
  } catch {
    /* Billing enforces finance roles on every write. */
  }

  let profileResponse: Response;
  try {
    profileResponse = await fetch(
      `${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/profile/me`,
      {
        headers: { authorization: `Bearer ${session.accessToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (profileResponse.status !== 401 && !profileResponse.ok)
      throw new Error('Profile service unavailable');
  } catch {
    return (
      <main className="account-shell">
        <section className="account-card">
          <p className="eyebrow">Votre espace</p>
          <h1>Profil momentanément indisponible</h1>
          <p className="account-copy">
            Vos données de profil ne peuvent pas être chargées. Réessayez dans quelques instants.
          </p>
          <a className="account-link" href="/account">
            Réessayer
          </a>
        </section>
      </main>
    );
  }
  if (profileResponse.status === 401) redirect('/api/auth/login?returnTo=%2Faccount');
  const profilePayload: unknown = await profileResponse.json();
  if (!isProfile(profilePayload)) {
    return (
      <main className="account-shell">
        <section className="account-card">
          <p className="eyebrow">Votre espace</p>
          <h1>Réponse invalide</h1>
          <p className="account-copy">Le service de profil a retourné une réponse inattendue.</p>
        </section>
      </main>
    );
  }
  const profile = profilePayload;

  return (
    <main className="account-shell">
      <nav className="account-nav">
        <Link className="brand" href="/">
          Invita<span>Flow</span>
        </Link>
        <div>
          {canManagePricing && (
            <a className="account-link" href="/admin/pricing">
              Gérer les tarifs
            </a>
          )}
          <a className="account-link" href="/account/report">
            Signaler un contenu
          </a>
          <a className="account-link" href="/account/notifications">
            Notifications
          </a>
          <a className="account-link" href="/account/wallet">
            Crédits & tarifs
          </a>
          <a className="account-link" href="/events">
            Mes événements
          </a>
          <span>Espace personnel</span>
        </div>
      </nav>
      <section className="account-card">
        <p className="eyebrow">Votre espace</p>
        <h1>Bonjour{profile.displayName ? `, ${profile.displayName}` : ''}.</h1>
        <p className="account-copy">
          Vous pouvez télécharger les données de votre compte: profil, événements, invités,
          placements, designs et versions, lots d’invitations, crédits, paiements, notifications et
          métadonnées des médias. Les PDF/ZIP générés sont à télécharger depuis vos invitations; les
          fichiers originaux des médias et les fichiers d’import ne sont pas inclus dans cet export.
        </p>
        <div className="identity-row">
          <span>Adresse e-mail</span>
          <strong>{profile.email ?? 'Non renseignée'}</strong>
        </div>
        <ProfileForm profile={profile} />
      </section>
    </main>
  );
}
