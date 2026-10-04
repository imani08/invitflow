import type { Metadata } from 'next';
import { RsvpForm } from './rsvp-form';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import './rsvp.css';
import '../../events/journey.css';
import './rsvp-journey.css';

export const metadata: Metadata = { title: 'Répondre à une invitation — InvitaFlow', robots: { index: false, follow: false, nocache: true } };
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="rsvp-shell"><header className="rsvp-topbar"><BrandLogo variant="compact"/><ThemeToggle/></header><RsvpForm token={token} /></main>;
}
