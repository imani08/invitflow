import type { Metadata } from 'next';
import { LegalDocumentPage } from '@/app/lib/legal-document-page';
export const metadata: Metadata = { title: 'Politique de remboursement · InvitaFlow', robots: { index: false, follow: false } };
export default function Page() { return <LegalDocumentPage slug="refund-policy" />; }
