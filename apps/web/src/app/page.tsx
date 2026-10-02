import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
export default async function Home({ searchParams }: { searchParams?: Promise<{ auth?: string }> }) {
  const authStatus = (await searchParams)?.auth;
  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Navigation principale">
        <BrandLogo priority className="home-brand" />
        <a className="nav-link" href="#vision">Découvrir</a>
      </nav>
      <section className="hero" id="vision">
        <p className="eyebrow">Invitations · Événements · Ensemble</p>
        <h1>Une création.<br /><em>Une invitation unique.</em></h1>
        {authStatus === 'failed' || authStatus === 'unavailable' ? <p className="auth-error" role="alert">{authStatus === 'unavailable' ? 'Le service de connexion est momentanément indisponible. Réessayez plus tard.' : 'La connexion n’a pas abouti. Réessayez.'}</p> : null}
        <p className="intro">Créez, personnalisez et gérez vos invitations depuis un seul espace — pour les célébrations, rencontres et événements qui rassemblent.</p>
        <div className="hero-actions">
          <a className="primary-action" href="/api/auth/login">Créer mon invitation</a>
          <a className="secondary-action" href="#vision">Découvrir InvitaFlow</a>
        </div>
      </section>
      <footer className="brand-footer"><BrandLogo className="footer-brand"/><span>Une attention pour chacun.</span><Link className="legal-footer-link" href="/legal">Informations légales</Link></footer>
    </main>
  );
}
