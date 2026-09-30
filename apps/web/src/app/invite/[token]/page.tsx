import Link from 'next/link';
import type { Metadata } from 'next';
import { RsvpForm } from './rsvp-form';
import './rsvp.css';

export const metadata: Metadata = { title: 'Répondre à une invitation — InvitaFlow', robots: { index: false, follow: false, nocache: true } };
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="rsvp-shell"><Link href="/" className="rsvp-brand">Invita<span>Flow</span></Link><RsvpForm token={token} /></main>;
}
