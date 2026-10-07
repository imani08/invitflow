'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MouseEventHandler } from 'react';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';

const modules = [
  { href: '/admin', label: 'Vue générale', section: 'Administration', roles: ['SUPPORT_ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin#moderation', label: 'Modération', section: 'Administration', roles: ['SUPPORT_ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin#audit', label: 'Audit & sécurité', section: 'Administration', roles: ['SUPPORT_ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/analytics', label: 'Indicateurs', section: 'Finance', roles: ['FINANCE_ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/finance', label: 'Paiements', section: 'Finance', roles: ['FINANCE_ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/pricing', label: 'Tarifs', section: 'Finance', roles: ['FINANCE_ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/partners', label: 'Partenaires', section: 'Finance', roles: ['FINANCE_ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/storage', label: 'Stockage', section: 'Plateforme', roles: ['SUPPORT_ADMIN', 'SUPER_ADMIN'] },
];

const secondary = [
  { href: '/account', label: 'Mon compte' },
  { href: '/account/notifications', label: 'Notifications' },
  { href: '/account/report', label: 'Créer un signalement' },
];

function ModuleLinks({ roles, currentPath, onNavigate }: { roles: string[]; currentPath: string; onNavigate?: MouseEventHandler<HTMLAnchorElement> }) {
  const visible = modules.filter((item) => item.roles.some((role) => roles.includes(role)));
  const sections = [...new Set(visible.map((item) => item.section))];
  return <>
    {sections.map((section) => (
      <div className="admin-nav-section" key={section}>
        <span>{section}</span>
        {visible.filter((item) => item.section === section).map((item) => {
          const href = item.href.split('#')[0];
          const active = !item.href.includes('#') && currentPath === href;
          return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} {...(onNavigate ? { onClick: onNavigate } : {})}>{item.label}</Link>;
        })}
      </div>
    ))}
  </>;
}

export function AdminNavigation({ roles }: { roles: string[] }) {
  const pathname = usePathname();
  return <>
    <aside className="admin-sidebar" aria-label="Navigation du back-office">
      <BrandLogo variant="compact" href="/admin" className="admin-brand" />
      <ModuleLinks roles={roles} currentPath={pathname} />
      <div className="admin-nav-secondary">
        <span>Raccourcis</span>
        {secondary.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
      </div>
      <div className="admin-nav-theme"><ThemeToggle /></div>
    </aside>
    <header className="admin-mobile-header">
      <BrandLogo variant="compact" href="/admin" className="admin-brand" />
      <ThemeToggle />
      <details className="admin-mobile-menu">
        <summary aria-label="Ouvrir la navigation administrative">Menu</summary>
        <nav aria-label="Navigation administrative mobile">
          <ModuleLinks roles={roles} currentPath={pathname} onNavigate={(event) => {
            const details = event.currentTarget.closest('details');
            if (details) details.open = false;
          }} />
          <div className="admin-nav-section">
            <span>Raccourcis</span>
            {secondary.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}
          </div>
        </nav>
      </details>
    </header>
  </>;
}
