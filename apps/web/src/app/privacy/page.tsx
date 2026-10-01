import type { Metadata } from 'next';
import { LegalDocumentPage } from '@/app/lib/legal-document-page';
export const metadata: Metadata = { title: 'Confidentialité · InvitaFlow', robots: { index: false, follow: false } };
export default function Page() { return <LegalDocumentPage slug="privacy" />; }
