import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { legalDocuments, legalDocumentVersion } from '@/lib/legal-documents';
import './legal.css';

export const metadata = { title: 'Légal & confidentialité · InvitaFlow', robots: { index: false, follow: false } };

export default function LegalIndexPage() {
  return <main className="legal-shell">
    <header className="legal-topbar"><BrandLogo variant="compact" href="/"/><ThemeToggle/></header>
    <p className="legal-status">DOCUMENTS · VERSION {legalDocumentVersion}</p>
    <h1>Légal & confidentialité</h1>
    <p className="legal-intro">Retrouvez les informations applicables à InvitaFlow, service exploité par FOCUS HD ENTREPRISES.</p>
    <ul className="legal-list">{legalDocuments.map((document) => <li key={document.slug}><Link href={`/legal/${document.slug}`}><span><strong>{document.title}</strong><small>{document.purpose}</small></span><span aria-hidden="true">→</span></Link></li>)}</ul>
    <p className="legal-intro">Une question ? <Link href="/contact">Contacter FOCUS HD ENTREPRISES</Link></p>
  </main>;
}
