import './globals.css';
import Link from 'next/link';

const availableModules = [
  { name: 'Modération & audit', description: 'Consulter les signalements actifs et le journal administratif.', href: '/admin', area: 'support' },
  { name: 'Paiements', description: 'Filtrer les opérations et examiner leurs références.', href: '/admin/finance', area: 'finance' },
  { name: 'Tarification', description: 'Gérer les packs et les grilles de prix publiées.', href: '/admin/pricing', area: 'finance' },
];

const unavailableModules = [
  'Utilisateurs', 'Événements', 'Wallet & crédits', 'Factures', 'Templates', 'Jobs & DLQ', 'Analytics', 'Sécurité',
];

function platformUrl(path: string) {
  const origin = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
  return new URL(path, origin).toString();
}

export default function AdminHome() {
  return (
    <main className="admin-home">
      <header className="admin-masthead">
        <Link className="admin-brand" href="/" aria-label="InvitaFlow Administration">
          <span className="admin-brand-mark">IF</span>
          <span>INVITAFLOW <small>ADMINISTRATION</small></span>
        </Link>
        <a className="admin-platform-link" href={platformUrl('/account')}>Ouvrir la plateforme ↗</a>
      </header>

      <section className="admin-welcome">
        <span className="admin-eyebrow">ESPACE OPÉRATIONS</span>
        <h1>Console d’administration</h1>
        <p>Accédez aux outils administratifs disponibles. Chaque espace applique ses propres droits d’accès.</p>
      </section>

      <section className="admin-section" aria-labelledby="available-heading">
        <div className="admin-section-heading">
          <div><span className="admin-eyebrow">OUTILS ACTIFS</span><h2 id="available-heading">Espaces disponibles</h2></div>
          <span className="admin-count">{availableModules.length} modules</span>
        </div>
        <div className="admin-module-grid">
          {availableModules.map((module) => (
            <a className="admin-module-card" href={platformUrl(module.href)} key={module.name}>
              <span className={`admin-module-tag ${module.area}`}>{module.area === 'support' ? 'SUPPORT' : 'FINANCE'}</span>
              <h3>{module.name}</h3>
              <p>{module.description}</p>
              <span className="admin-module-action">Ouvrir l’espace <span aria-hidden="true">→</span></span>
            </a>
          ))}
        </div>
      </section>

      <section className="admin-section unavailable-section" aria-labelledby="unavailable-heading">
        <div className="admin-section-heading">
          <div><span className="admin-eyebrow">EN PRÉPARATION</span><h2 id="unavailable-heading">Modules non disponibles</h2></div>
          <span className="admin-count">{unavailableModules.length} modules</span>
        </div>
        <ul className="unavailable-list">
          {unavailableModules.map((name) => <li key={name}><span>{name}</span><span className="coming-soon">API non disponible</span></li>)}
        </ul>
      </section>

      <footer className="admin-footer">
        Les données administratives sont chargées uniquement dans les espaces autorisés. Aucun indicateur fictif n’est affiché.
      </footer>
    </main>
  );
}
