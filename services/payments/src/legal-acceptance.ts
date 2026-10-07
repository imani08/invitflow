import manifest from '@invitaflow/legal-contract/manifest.json' with { type: 'json' };

export const PAYMENT_LEGAL_VERSIONS = {
  salesTerms: manifest.version,
  refundPolicy: manifest.version,
} as const;

export function paymentLegalAccepted(body: Record<string, unknown>) {
  return body['salesTermsAccepted'] === true && body['refundPolicyAccepted'] === true;
}
