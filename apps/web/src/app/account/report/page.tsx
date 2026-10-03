import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import AppNavbar from '@/components/AppNavbar';
import { ReportForm } from './report-form';
import './report.css';

export const dynamic = 'force-dynamic';
export default async function ReportPage() {
  const store = await cookies(); const session = await getSession(store.get(sessionCookieName())?.value);
  if (!session) redirect(`/api/auth/login?returnTo=${encodeURIComponent('/account/report')}`);
  return <main className="report-shell"><AppNavbar /><section><span>SIGNALER UN CONTENU</span><h1>Contribuer à une communauté sûre</h1><p>Votre signalement sera examiné par l’équipe support. N’incluez pas de coordonnées personnelles dans la description.</p><ReportForm /></section></main>;
}
