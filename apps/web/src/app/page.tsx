import Link from 'next/link';
export default async function Home({ searchParams }: { searchParams?: Promise<{ auth?: string }> }) {
  const authStatus = (await searchParams)?.auth;
  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Navigation principale">
        <Link className="brand" href="/">Invita<span>Flow</span></Link>
        <a className="nav-link" href="#vision">Découvrir</a>
      </nav>
      <section className="hero" id="vision">
        <p className="eyebrow">L’art de recevoir, réinventé</p>
        <h1>Une création.<br /><em>Une invitation unique.</em></h1>
        {authStatus === 'failed' || authStatus === 'unavailable' ? <p className="auth-error" role="alert">{authStatus === 'unavailable' ? 'Le service de connexion est momentanément indisponible. Réessayez plus tard.' : 'La connexion n’a pas abouti. Réessayez.'}</p> : null}
        <p className="intro">Importez votre liste, personnalisez chaque invitation et gérez chaque entrée depuis un espace unique.</p>
        <div className="hero-actions">
          <a className="primary-action" href="/api/auth/login">Créer mon invitation</a>
          <a className="secondary-action" href="#vision">Découvrir InvitaFlow</a>
        </div>
      </section>
      <footer>InvitaFlow <span>·</span> Une attention pour chacun. <Link className="legal-footer-link" href="/legal">Informations légales</Link></footer>
    </main>
  );
}
