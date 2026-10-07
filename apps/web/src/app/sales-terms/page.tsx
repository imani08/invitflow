import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
export const metadata: Metadata = { title: 'Conditions générales de vente · InvitaFlow', robots: { index: false, follow: false } };
export default function Page() { redirect('/legal/cgv'); }
