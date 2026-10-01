export type LegalSlug = 'terms' | 'sales-terms' | 'privacy' | 'refund-policy' | 'cookies' | 'contact';

export const legalDocuments: Record<LegalSlug, { title: string; purpose: string }> = {
  terms: { title: 'Conditions d’utilisation', purpose: 'Règles d’accès et d’utilisation de la plateforme.' },
  'sales-terms': { title: 'Conditions générales de vente', purpose: 'Conditions applicables aux achats de crédits et services.' },
  privacy: { title: 'Confidentialité et données personnelles', purpose: 'Données traitées, finalités, droits et durées de conservation.' },
  'refund-policy': { title: 'Politique de remboursement', purpose: 'Règles applicables aux remboursements et réclamations.' },
  cookies: { title: 'Cookies et traceurs', purpose: 'Cookies utilisés, finalités et choix de l’utilisateur.' },
  contact: { title: 'Contact', purpose: 'Coordonnées vérifiées de l’éditeur et du support.' },
};

export const legalDocumentVersion = 'draft-0.1.0';

export function isLegalSlug(value: string): value is LegalSlug {
  return Object.hasOwn(legalDocuments, value);
}
