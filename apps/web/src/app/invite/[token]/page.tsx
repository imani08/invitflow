import type { Metadata } from 'next';
import { RsvpForm } from './rsvp-form';
import { BrandLogo } from '@/components/brand-logo';
import './rsvp.css';

export const metadata: Metadata = { title: 'Répondre à une invitation — InvitaFlow', robots: { index: false, follow: false, nocache: true } };
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="rsvp-shell"><BrandLogo variant="compact"/><RsvpForm token={token} /></main>;
}
