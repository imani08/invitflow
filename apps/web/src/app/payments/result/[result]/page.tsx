import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { PaymentResult } from './payment-result';
import '../../../events/journey.css';
import '../../../account/wallet/wallet.css';

export const dynamic = 'force-dynamic';

export default async function PaymentResultPage({ params, searchParams }: { params: Promise<{ result: string }>; searchParams: Promise<{ paymentId?: string }> }) {
  const [{ result }, query, cookieStore] = await Promise.all([params, searchParams, cookies()]);
  if (!['success', 'cancel', 'error'].includes(result)) notFound();
  const returnTo = `/payments/result/${result}${query.paymentId ? `?paymentId=${encodeURIComponent(query.paymentId)}` : ''}`;
  const session = await getSession(cookieStore.get(sessionCookieName())?.value);
  if (!session) redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  return <PaymentResult result={result as 'success' | 'cancel' | 'error'} paymentId={query.paymentId ?? ''} />;
}
