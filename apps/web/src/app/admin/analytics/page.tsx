import { decodeJwt } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

type Metric = { day: string; metric: string; currency: string; count: string; valueMinor: string };
type MetricsResponse = { from: string; to: string; items: Metric[] };

const labels: Record<string, string> = {
  events_created: 'Événements créés',
  invitations_generated: 'Invitations générées',
  render_total: 'Cartes rendues',
  invitation_batches_failed: 'Lots de rendu en échec',
  render_failures: 'Rendus en échec',
  ai_jobs_total: 'Jobs IA demandés',
  ai_jobs_completed: 'Jobs IA terminés',
  ai_jobs_failed: 'Jobs IA en échec',
  payments_succeeded: 'Paiements réussis',
  revenue_minor: 'Revenu (unités mineures)',
  refund_minor: 'Remboursements (unités mineures)',
  payments_refunded: 'Paiements remboursés',
  credits_sold: 'Crédits vendus',
  credits_consumed: 'Crédits consommés',
  rsvp_responses: 'Réponses RSVP',
  checkins: 'Pointages',
};

export default async function AnalyticsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const filters = await searchParams;
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Fadmin%2Fanalytics');
  let roles: string[] = [];
  try {
    const access = decodeJwt(session.accessToken)['realm_access'];
    roles =
      access && typeof access === 'object' && 'roles' in access && Array.isArray(access.roles)
        ? access.roles.filter((role): role is string => typeof role === 'string')
        : [];
  } catch {
    /* The Analytics API verifies the signed token and role again. */
  }
  if (!roles.some((role) => role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN')) {
    return (
      <main className="admin-shell">
        <a href="/admin">← Administration</a>
        <section className="admin-denied">
          <span>ACCÈS RESTREINT</span>
          <h1>Permission Finance ou Super Admin requise</h1>
          <p>Les agrégats globaux sont réservés à l’administration autorisée.</p>
        </section>
      </main>
    );
  }

  const query = new URLSearchParams();
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  let data: MetricsResponse | null = null;
  try {
    const response = await fetch(
      `${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/admin/analytics/daily${query.size ? `?${query}` : ''}`,
      {
        headers: { authorization: `Bearer ${session.accessToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (response.ok) data = (await response.json()) as MetricsResponse;
  } catch {
    /* Show the service state below without fabricating metrics. */
  }

  return (
    <main className="admin-shell">
      <header>
        <span>INVITAFLOW · ANALYTICS</span>
        <h1>Indicateurs produit</h1>
        <p>Agrégats journaliers produits depuis les événements métier traités.</p>
      </header>
      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <small>PROJECTION JOURNALIÈRE</small>
            <h2>{data ? `${data.from} — ${data.to}` : 'Données indisponibles'}</h2>
          </div>
          <span>{data ? `${data.items.length} ligne(s)` : 'Service indisponible'}</span>
        </div>
        {data?.items.length ? (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Jour UTC</th>
                  <th>Indicateur</th>
                  <th>Nombre</th>
                  <th>Valeur agrégée</th>
                  <th>Devise</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={`${item.day}-${item.metric}-${item.currency}`}>
                    <td>{item.day}</td>
                    <td>{labels[item.metric] ?? item.metric}</td>
                    <td>{item.count}</td>
                    <td>{item.valueMinor}</td>
                    <td>{item.currency || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : data ? (
          <p className="admin-empty">
            Aucun événement Analytics n’a encore alimenté cette période.
          </p>
        ) : (
          <p className="admin-empty">
            L’API Analytics n’a pas pu répondre. Vérifiez l’état du service, RabbitMQ et la
            migration de sa base.
          </p>
        )}
      </section>
    </main>
  );
}
