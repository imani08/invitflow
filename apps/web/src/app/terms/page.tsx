import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
export const metadata: Metadata = { title: 'Conditions d’utilisation · InvitaFlow', robots: { index: false, follow: false } };
export default function Page() { redirect('/legal/cgu'); }
