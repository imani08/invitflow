import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
export const metadata: Metadata = { title: 'Politique de remboursement · InvitaFlow', robots: { index: false, follow: false } };
export default function Page() { redirect('/legal/remboursements'); }
