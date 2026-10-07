import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
export const metadata: Metadata = { title: 'Confidentialité · InvitaFlow', robots: { index: false, follow: false } };
export default function Page() { redirect('/legal/confidentialite'); }
