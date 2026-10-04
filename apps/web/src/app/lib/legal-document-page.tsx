import Link from 'next/link';
import { headers } from 'next/headers';
import { legalDocuments, legalDocumentVersion, type LegalSlug } from '@/lib/legal-documents';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import '../legal/legal.css';

export async function LegalDocumentPage({ slug }: { slug: LegalSlug }) {
  await headers();
  const document = legalDocuments[slug];
  const configuredValue = process.env['LEGAL_CONTACT_EMAIL'];
  const configuredContact = configuredValue && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(configuredValue) ? configuredValue : undefined;
  return <main className="legal-shell">
    <header className="legal-topbar"><BrandLogo variant="compact"/><ThemeToggle/></header>
    <p className="legal-status">BROUILLON · NON PUBLIÉ · {legalDocumentVersion}</p>
    <h1>{document.title}</h1>
    <p className="legal-intro">{document.purpose}</p>
    <section className="legal-blocker" aria-labelledby="legal-blocker-title">
      <h2 id="legal-blocker-title">Contenu en attente de validation</h2>
      <p>Ce document n’est pas en vigueur. Il sera publié après confirmation des informations officielles de l’entreprise et validation par un professionnel qualifié. Aucune clause ni règle de conservation n’est présumée ici.</p>
      {slug === 'contact' && <p>{configuredContact ? <>Contact configuré : <a href={`mailto:${configuredContact}`}>{configuredContact}</a></> : 'Les coordonnées vérifiées du support ne sont pas encore configurées.'}</p>}
    </section>
    <p className="legal-back"><Link href="/legal">← Toutes les informations légales</Link></p>
  </main>;
}
