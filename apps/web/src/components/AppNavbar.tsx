'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';

type AppNavbarProps = { eventId?: string; showPricingAdmin?: boolean; area?: 'agency' | 'partner' };

const iconPaths: Record<string, string> = {
  events: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  guests: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m16 0v-2a4 4 0 0 0-3-3.87M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm6-7.87a4 4 0 0 1 0 7.75',
  create: 'M12 5v14m-7-7h14',
  invitations: 'M3 5h18v14H3zM3 6l9 7 9-7',
  account: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  wallet: 'M3 6a2 2 0 0 1 2-2h15v16H5a2 2 0 0 1-2-2zm0 2h17m-5 5h.01',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9m-8 12a2 2 0 0 0 4 0',
  agency: 'M3 21h18M4 21V8l8-5 8 5v13M8 11v2m4-2v2m4-2v2M8 17v2m4-2v2m4-2v2',
  partner: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m16 0v-2a4 4 0 0 0-3-3.87M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm6-7.87a4 4 0 0 1 0 7.75',
  support: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm-3-13a3 3 0 1 1 5.5 1.7c-1 1.3-2.5 1.3-2.5 3.3m0 3h.01',
};

function Icon({ name }: { name: keyof typeof iconPaths }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]} /></svg>;
}

export default function AppNavbar({ eventId, showPricingAdmin = false, area }: AppNavbarProps) {
  const pathname = usePathname();
  const eventBase = eventId ? `/events/${encodeURIComponent(eventId)}` : null;
  const eventLinks = eventBase ? [
    { href: eventBase, label: 'Aperçu', icon: 'events' as const },
    { href: `${eventBase}/guests`, label: 'Invités', icon: 'guests' as const },
    { href: `${eventBase}/seating`, label: 'Placement', icon: 'guests' as const },
    { href: `${eventBase}/designs`, label: 'Design & modèles', icon: 'create' as const },
    { href: `${eventBase}/invitations`, label: 'Invitations', icon: 'invitations' as const },
    { href: `${eventBase}/check-in`, label: 'QR & check-in', icon: 'invitations' as const },
  ] : [];
  const mainLinks = [
    { href: '/dashboard', label: 'Accueil', icon: 'events' as const },
    { href: '/events', label: 'Mes événements', icon: 'events' as const },
    { href: '/account/wallet', label: 'Crédits & tarifs', icon: 'wallet' as const },
    { href: '/account/notifications', label: 'Notifications', icon: 'bell' as const },
    { href: '/agencies', label: 'Espace agence', icon: 'agency' as const },
    { href: '/partners', label: 'Espace partenaire', icon: 'partner' as const },
    { href: '/account', label: 'Mon compte', icon: 'account' as const },
    { href: '/account/report', label: 'Aide & signalement', icon: 'support' as const },
    ...(showPricingAdmin ? [{ href: '/admin/pricing', label: 'Gérer les tarifs', icon: 'wallet' as const }] : []),
  ];
  const agencyLinks = area === 'agency' ? [
    { href: '/agencies#clients', label: 'Clients', icon: 'guests' as const },
    { href: '/agencies#events', label: 'Événements agence', icon: 'events' as const },
    { href: '/agencies#team', label: 'Équipe', icon: 'agency' as const },
    { href: '/agencies#subscription', label: 'Abonnement', icon: 'wallet' as const },
  ] : [];
  const partnerLinks = area === 'partner' ? [
    { href: '/partners#attributions', label: 'Attributions', icon: 'partner' as const },
    { href: '/partners#commissions', label: 'Commissions', icon: 'wallet' as const },
    { href: '/partners#payouts', label: 'Règlements', icon: 'wallet' as const },
  ] : [];
  const active = (href: string) => pathname === href || (href !== '/events' && href !== eventBase && pathname.startsWith(`${href}/`));
  const eventItems = eventLinks.length ? eventLinks : [
    { href: '/account/wallet', label: 'Crédits', icon: 'wallet' as const },
    { href: '/account/notifications', label: 'Alertes', icon: 'bell' as const },
  ];
  const mobileItems = [
    { href: '/events', label: 'Événements', icon: 'events' as const },
    eventItems[1]!,
    { href: '/events#create-event', label: 'Créer', icon: 'create' as const, primary: true },
    eventItems.length > 2 ? eventItems[4]! : { href: '/account/notifications', label: 'Alertes', icon: 'bell' as const },
    { href: '/account', label: 'Compte', icon: 'account' as const },
  ];
  const agencyMobileItems = [
    { href: '/agencies', label: 'Accueil', icon: 'agency' as const },
    { href: '/agencies#clients', label: 'Clients', icon: 'guests' as const },
    { href: '/agencies#events', label: 'Événements', icon: 'events' as const },
    { href: '/agencies#create-event', label: 'Créer', icon: 'create' as const, primary: true },
    { href: '/account', label: 'Compte', icon: 'account' as const },
  ];
  const partnerMobileItems = [
    { href: '/partners', label: 'Accueil', icon: 'partner' as const },
    { href: '/partners#attributions', label: 'Code', icon: 'partner' as const },
    { href: '/partners#commissions', label: 'Commissions', icon: 'wallet' as const },
    { href: '/partners#payouts', label: 'Règlements', icon: 'wallet' as const },
    { href: '/account', label: 'Compte', icon: 'account' as const },
  ];
  const visibleMobileItems = area === 'agency' ? agencyMobileItems : area === 'partner' ? partnerMobileItems : mobileItems;
  const mobileActive = (href: string) => area === 'agency' ? href === '/agencies' && pathname === '/agencies' : area === 'partner' ? href === '/partners' && pathname === '/partners' : active(href);

  return <>
    <aside className="app-sidebar" aria-label="Navigation de l’application">
      <div className="app-sidebar-brand"><BrandLogo variant="compact" href="/events" /></div>
      <Link className="app-create-link" href={area === 'agency' ? '/agencies#create-event' : area === 'partner' ? '/partners#attributions' : '/events#create-event'}><Icon name={area === 'partner' ? 'partner' : 'create'} />{area === 'agency' ? 'Créer un événement client' : area === 'partner' ? 'Lien partenaire' : 'Créer un événement'}</Link>
      <nav className="app-sidebar-links" aria-label="Principale">
        <p className="app-nav-caption">ESPACE</p>
        {mainLinks.map((item) => <Link key={item.href} href={item.href} aria-current={active(item.href) ? 'page' : undefined} className={active(item.href) ? 'is-active' : ''}><Icon name={item.icon} /><span>{item.label}</span></Link>)}
        {agencyLinks.length > 0 && <><p className="app-nav-caption app-event-caption">AGENCE</p>{agencyLinks.map((item) => <Link key={item.href} href={item.href}><Icon name={item.icon} /><span>{item.label}</span></Link>)}</>}
        {partnerLinks.length > 0 && <><p className="app-nav-caption app-event-caption">PARTENARIAT</p>{partnerLinks.map((item) => <Link key={item.href} href={item.href}><Icon name={item.icon} /><span>{item.label}</span></Link>)}</>}
        {eventLinks.length > 0 && <>
          <p className="app-nav-caption app-event-caption">ÉVÉNEMENT</p>
          {eventLinks.map((item) => <Link key={item.href} href={item.href} aria-current={active(item.href) ? 'page' : undefined} className={active(item.href) ? 'is-active' : ''}><Icon name={item.icon} /><span>{item.label}</span></Link>)}
        </>}
      </nav>
      <div className="app-sidebar-bottom"><ThemeToggle/><form className="app-sidebar-logout" action="/api/auth/logout" method="post"><button type="submit">Déconnexion</button></form></div>
    </aside>
    <div className="app-mobile-topbar"><BrandLogo variant="compact" href="/events" /><ThemeToggle/><form action="/api/auth/logout" method="post"><button type="submit">Quitter</button></form></div>
    {eventId && <nav className="event-subnav" aria-label="Sections de l’événement">{eventLinks.map((item) => <Link key={item.href} href={item.href} aria-current={active(item.href) ? 'page' : undefined}>{item.label}</Link>)}</nav>}
    <nav className="app-mobile-nav" aria-label="Navigation mobile principale">{visibleMobileItems.map((item) => <Link key={`${item.href}:${item.label}`} href={item.href} aria-current={mobileActive(item.href) ? 'page' : undefined} className={`${mobileActive(item.href) ? 'is-active' : ''}${'primary' in item && item.primary ? ' app-mobile-create' : ''}`}><Icon name={item.icon} /><span>{item.label}</span></Link>)}</nav>
  </>;
}
