import { notFound } from 'next/navigation';
import { PublicCheckInWorkspace } from './public-checkin-workspace';
import '../../events/[eventId]/check-in/check-in.css';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function PublicCheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  return <main className="check-shell"><PublicCheckInWorkspace token={token} /></main>;
}
