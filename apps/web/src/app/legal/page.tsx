import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { legalDocuments, legalDocumentVersion } from '@/lib/legal-documents';
import './legal.css';

export const metadata: Metadata = { title: 'Informations légales · InvitaFlow', robots: { index: false, follow: false } };

export default async function LegalIndexPage() {
  await headers();
  return <main className="legal-shell">
    <header className="legal-topbar"><BrandLogo variant="compact"/><ThemeToggle/></header>
    <p className="legal-status">DOCUMENTS EN PRÉPARATION · {legalDocumentVersion}</p>
    <h1>Informations légales</h1>
    <p className="legal-intro">Les documents ci-dessous ne sont pas publiés. Leur contenu dépend des informations officielles de l’entreprise et d’une validation juridique.</p>
    <ul className="legal-list">{Object.entries(legalDocuments).map(([slug, document]) => <li key={slug}><Link href={`/${slug}`}><span><strong>{document.title}</strong><small>{document.purpose}</small></span><span aria-hidden="true">→</span></Link></li>)}</ul>
    <p className="legal-blocker">Publication bloquée jusqu’à confirmation des coordonnées légales et validation professionnelle.</p>
  </main>;
}
