import type { Metadata } from 'next';
import { headers } from 'next/headers';
export const metadata: Metadata = { applicationName: 'InvitaFlow', title: 'InvitaFlow · Administration', description: 'Administration InvitaFlow', icons: { icon: '/icon.png', apple: '/apple-icon.png' }, manifest: '/manifest.webmanifest' };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Read the request CSP so Next.js renders nonce-bearing scripts per request.
  await headers();
  return <html lang="fr"><body>{children}</body></html>;
}
