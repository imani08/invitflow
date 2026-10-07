import Link from 'next/link';
import { legalCompany } from '@/lib/legal-documents';

const footerLinks = [
  { href: '/legal/cgu', label: 'CGU' },
  { href: '/legal/cgv', label: 'CGV' },
  { href: '/legal/confidentialite', label: 'Confidentialité' },
  { href: '/legal/remboursements', label: 'Remboursements' },
  { href: '/legal/agences', label: 'Conditions Agences' },
  { href: '/legal/partenaires', label: 'Conditions Partenaires' },
  { href: '/legal', label: 'Légal & confidentialité' },
  { href: '/contact', label: 'Contact' },
];

export function LegalFooter() {
  return (
    <footer className="legal-global-footer">
      <div className="legal-global-footer__company">
        <strong>{legalCompany.name}</strong>

        <div className="legal-global-footer__contact">
          <a href={`mailto:${legalCompany.email}`}>
            {legalCompany.email}
          </a>

          <a href={`tel:${legalCompany.phone}`}>
            {legalCompany.phone}
          </a>
        </div>
      </div>

      <nav
        className="legal-global-footer__links"
        aria-label="Liens juridiques"
      >
        {footerLinks.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}