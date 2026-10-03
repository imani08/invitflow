import type { Metadata } from 'next';
import './globals.css';
import '@/components/AppNavbar.css';

export const metadata: Metadata = {
  applicationName: 'InvitaFlow',
  title: { default: 'InvitaFlow — Invitations et événements', template: '%s · InvitaFlow' },
  description: 'Créez, personnalisez et gérez vos invitations depuis un seul espace.',
  icons: { icon: '/icon.png', apple: '/apple-icon.png' },
  manifest: '/manifest.webmanifest',
  openGraph: { title: 'InvitaFlow — Invitations et événements', description: 'Créez, personnalisez et gérez vos invitations depuis un seul espace.', siteName: 'InvitaFlow', type: 'website', images: [{ url: '/brand/invitaflow-logo.png', width: 1174, height: 344, alt: 'InvitaFlow — Invitations · Events · Together' }] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
