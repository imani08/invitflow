import Link from 'next/link';
import { headers } from 'next/headers';
import { ThemeToggle } from '@/components/theme-toggle';

export default async function NotFound() {
  await headers();
  return <main className="page-shell"><ThemeToggle className="public-theme-toggle"/><section className="hero"><p className="eyebrow">404 · PAGE INTROUVABLE</p><h1>Cette page<br /><em>n’existe pas.</em></h1><p className="intro">Vérifiez l’adresse ou revenez à l’accueil InvitaFlow.</p><Link className="primary-action" href="/">Retour à l’accueil</Link></section></main>;
}
