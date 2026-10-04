import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import './home.css';

const capabilities = [
  { number: '01', title: 'Organisez votre événement', text: 'Rassemblez cérémonies, invités et plan de salle dans un espace unique.' },
  { number: '02', title: 'Imaginez votre invitation', text: 'Choisissez un modèle et personnalisez chaque détail de votre création.' },
  { number: '03', title: 'Partagez et accueillez', text: 'Générez les invitations, recueillez les réponses et suivez les arrivées.' },
];

export default async function Home({ searchParams }: { searchParams?: Promise<{ auth?: string }> }) {
  const authStatus = (await searchParams)?.auth;
  return <main className="home-shell">
    <nav className="home-nav" aria-label="Navigation publique">
      <BrandLogo priority className="home-brand" />
      <ThemeToggle className="home-theme-toggle" />
      <div className="home-nav-links"><a href="#fonctionnalites">Découvrir</a><Link href="/contact">Nous contacter</Link><Link href="/api/auth/login">Connexion</Link><Link className="home-nav-cta" href="/api/auth/login">Créer mon invitation <span aria-hidden="true">↗</span></Link></div>
    </nav>
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-hero-copy">
        <p className="home-eyebrow"><span /> INVITATIONS · ÉVÉNEMENTS · ENSEMBLE</p>
        <h1 id="home-title">Les beaux moments<br />commencent par <em>une invitation.</em></h1>
        {authStatus === 'failed' || authStatus === 'unavailable' ? <p className="home-auth-error" role="alert">{authStatus === 'unavailable' ? 'Le service de connexion est momentanément indisponible. Réessayez plus tard.' : 'La connexion n’a pas abouti. Réessayez.'}</p> : null}
        <p className="home-intro">Créez et gérez vos invitations, de la première idée à l’accueil de vos invités. Tout votre événement, dans un espace conçu pour vous.</p>
        <div className="home-actions"><Link className="home-primary-action" href="/api/auth/login">Commencer à créer <span aria-hidden="true">→</span></Link><a className="home-secondary-action" href="#fonctionnalites">Découvrir InvitaFlow</a></div>
        <p className="home-note">Connexion sécurisée · Vos événements restent les vôtres</p>
      </div>
      <div className="home-hero-art" aria-label="Illustration d’une invitation personnalisée">
        <div className="home-orbit home-orbit-one" /><div className="home-orbit home-orbit-two" />
        <div className="home-invitation-card"><span className="home-card-kicker">VOUS ÊTES INVITÉ·E</span><span className="home-card-rule" /><span className="home-card-title">Un moment<br /><em>à célébrer</em></span><span className="home-card-rule home-card-rule-short" /><span className="home-card-detail">La date · Le lieu · Ensemble</span><span className="home-card-seal" aria-hidden="true">✳</span></div>
        <span className="home-art-note home-art-note-top">Chaque détail compte</span><span className="home-art-note home-art-note-bottom">Pensé pour vos moments précieux</span>
      </div>
      <a className="home-scroll-hint" href="#fonctionnalites" aria-label="Défiler pour découvrir">↓</a>
    </section>
    <section className="home-capabilities" id="fonctionnalites" aria-labelledby="home-capabilities-title">
      <header><p className="home-eyebrow">DE L’IDÉE AU GRAND JOUR</p><h2 id="home-capabilities-title">Un seul espace.<br /><em>Toute votre organisation.</em></h2><p>Chaque étape se construit autour de votre événement et de vos invités.</p></header>
      <div className="home-capability-grid">{capabilities.map((item) => <article key={item.number}><span className="home-capability-number">{item.number}</span><span className="home-capability-mark" aria-hidden="true">✳</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
    </section>
    <section className="home-closing"><p className="home-eyebrow">VOTRE PROCHAIN MOMENT COMMENCE ICI</p><h2>Faites place à la célébration.</h2><Link className="home-primary-action" href="/api/auth/login">Créer mon espace <span aria-hidden="true">→</span></Link></section>
    <footer className="home-footer"><BrandLogo className="home-footer-brand" /><p>Invitations · Événements · Ensemble</p><nav aria-label="Informations et aide"><Link href="/legal">Informations légales</Link><Link href="/privacy">Confidentialité</Link><Link href="/terms">Conditions</Link><Link href="/contact">Contact</Link></nav></footer>
  </main>;
}
