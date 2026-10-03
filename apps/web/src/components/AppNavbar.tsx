import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';

type AppNavbarProps = { eventId?: string; showPricingAdmin?: boolean };

export default function AppNavbar({ eventId, showPricingAdmin = false }: AppNavbarProps) {
  return (
    <>
      <nav className="app-navbar" aria-label="Navigation principale">
        <BrandLogo href="/events" />
        <div className="app-navbar-links">
          <Link href="/events">Mes événements</Link>
          <Link href="/account/wallet">Crédits & tarifs</Link>
          <Link href="/account/notifications">Notifications</Link>
          <Link href="/account/report">Signaler un contenu</Link>
          <Link href="/account">Espace personnel</Link>
          {showPricingAdmin ? <Link href="/admin/pricing">Gérer les tarifs</Link> : null}
          <form action="/api/auth/logout" method="post">
            <button type="submit">Déconnexion</button>
          </form>
        </div>
      </nav>
      {eventId ? (
        <nav className="event-subnav" aria-label="Navigation de l’événement">
          <Link href={`/events/${encodeURIComponent(eventId)}`}>Aperçu</Link>
          <Link href={`/events/${encodeURIComponent(eventId)}/guests`}>Invités</Link>
          <Link href={`/events/${encodeURIComponent(eventId)}/seating`}>Placement</Link>
          <Link href={`/events/${encodeURIComponent(eventId)}/designs`}>Design</Link>
          <Link href={`/events/${encodeURIComponent(eventId)}/invitations`}>Invitations</Link>
          <Link href={`/events/${encodeURIComponent(eventId)}/check-in`}>Check-in</Link>
        </nav>
      ) : null}
    </>
  );
}
