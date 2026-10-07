import Image from 'next/image';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { legalCompany, legalDocumentVersion } from '@/lib/legal-documents';
import '../legal/legal.css';

export const metadata = { title: 'Contact · InvitaFlow', robots: { index: false, follow: false } };
const topics = ['Assistance compte', 'Paiements', 'Données personnelles', 'Signalement', 'Problème technique', 'Demande commerciale'];

export default function ContactPage() {
  return <main className="legal-shell contact-shell">
    <header className="legal-topbar"><BrandLogo variant="compact" href="/"/><ThemeToggle/></header>
    <p className="legal-status">NOUS CONTACTER · VERSION {legalDocumentVersion} · 6 OCTOBRE 2026</p>
    <h1>Parlons de votre demande.</h1>
    <section className="contact-company-card"><Image src="/brand/focus-hd-logo.jpeg" alt="Logo FOCUS HD ENTREPRISES" width={353} height={353} className="contact-company-logo"/><div><h2>{legalCompany.name}</h2><p>InvitaFlow est un produit exploité par {legalCompany.name}.</p><p><a href={`mailto:${legalCompany.email}`}>{legalCompany.email}</a><br/><a href={`tel:${legalCompany.phone}`}>{legalCompany.phone}</a></p></div></section>
    <h2>Votre sujet</h2><p className="legal-intro">Choisissez le sujet de votre message. Aucun formulaire de ticket n’est proposé actuellement.</p>
    <ul className="contact-topic-list">{topics.map((topic) => <li key={topic}><a href={`mailto:${legalCompany.email}?subject=${encodeURIComponent(topic)}`}>{topic}<span aria-hidden="true">↗</span></a></li>)}</ul>
    <p className="legal-intro">N’envoyez jamais de mot de passe, code OTP, code PIN Mobile Money, numéro complet de carte ou clé API.</p>
    <p><Link href="/legal">Consulter Légal & confidentialité</Link></p>
  </main>;
}
