import manifest from '@invitaflow/legal-contract/manifest.json';

export const legalCompany = {
  name: manifest.operator,
  product: manifest.product,
  email: manifest.contact.email,
  phone: manifest.contact.phone,
  address: null as string | null,
  rccm: null as string | null,
  nif: null as string | null,
  hostingProvider: null as string | null,
};

export const LEGAL_VERSIONS = {
  terms: manifest.version,
  privacy: manifest.version,
  salesTerms: manifest.version,
  refundPolicy: manifest.version,
} as const;

export const legalDocumentVersion = manifest.version;

const purposes: Record<string, string> = {
  'mentions-legales': 'Éditeur du service et informations légales.',
  cgu: 'Règles d’accès et d’utilisation de la plateforme.',
  cgv: 'Conditions applicables aux commandes et paiements.',
  confidentialite: 'Données traitées, finalités, droits et durées.',
  remboursements: 'Règles applicables aux remboursements et réclamations.',
  invites: 'Informations destinées aux personnes invitées.',
  cookies: 'Stockage technique et préférences de l’interface.',
  'utilisation-acceptable': 'Usages autorisés et interdits.',
  conservation: 'Principes de conservation et demandes de suppression.',
  ia: 'Transparence et responsabilités liées aux fonctions assistées.',
  agences: 'Conditions applicables à l’espace Agence.',
  partenaires: 'Conditions applicables aux partenaires et prestataires.',
};

export const legalDocuments = manifest.documents.map((document) => ({ ...document, purpose: purposes[document.slug] ?? document.title }));

export type LegalSlug = (typeof legalDocuments)[number]['slug'];

export function isLegalSlug(value: string): value is LegalSlug {
  return legalDocuments.some((document) => document.slug === value);
}

export function getLegalDocument(slug: LegalSlug) {
  return legalDocuments.find((document) => document.slug === slug)!;
}
