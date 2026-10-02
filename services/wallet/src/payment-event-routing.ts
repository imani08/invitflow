export type WalletPaymentCommand = { kind: 'CREDIT' | 'REFUND'; ownerSubject: string; paymentId: string; credits: number };

export function walletPaymentCommand(eventType: unknown, raw: unknown): WalletPaymentCommand | null {
  if (!['payment.succeeded.v1', 'payment.refunded.v1', 'payment.succeeded.v2', 'payment.refunded.v2'].includes(String(eventType)) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const payload = raw as Record<string, unknown>;
  const isLegacy = String(eventType).endsWith('.v1');
  // v1 only ever carried the legacy credit-pack flow; all new consumers must require the explicit type.
  if (!isLegacy && payload['orderType'] !== 'CREDIT_PURCHASE') return null;
  if (isLegacy && payload['orderType'] !== undefined && payload['orderType'] !== 'CREDIT_PURCHASE') return null;
  const paymentId = payload['paymentId'];
  const ownerSubject = payload['customerSubject'] ?? payload['ownerSubject'];
  const credits = payload['credits'];
  if (typeof paymentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(paymentId) || typeof ownerSubject !== 'string' || ownerSubject.length < 1 || ownerSubject.length > 255 || !Number.isSafeInteger(credits) || (credits as number) < 1) return null;
  return { kind: String(eventType).includes('.refunded.') ? 'REFUND' : 'CREDIT', ownerSubject, paymentId, credits: credits as number };
}
