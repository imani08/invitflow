import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'InvitaFlow — Une création, une invitation unique',
  description: 'Créez et gérez vos invitations événementielles avec InvitaFlow.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
