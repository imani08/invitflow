import type { Metadata } from 'next';
import { headers } from 'next/headers';
export const metadata: Metadata = { title: 'InvitaFlow Admin', description: 'Administration InvitaFlow' };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Read the request CSP so Next.js renders nonce-bearing scripts per request.
  await headers();
  return <html lang="fr"><body>{children}</body></html>;
}
