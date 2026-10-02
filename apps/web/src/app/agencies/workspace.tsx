'use client';

import { useState, type FormEvent } from 'react';

export type AgencyPlan = { id: string; key: string; name: string; credits: number; priceMinor: number; currency: string; segment: string };
export type Agency = { id: string; name: string; status: string; role: 'OWNER' | 'ADMIN' | 'MEMBER'; plan: null | { planName: string; quotaCredits: number; priceMinor: number; currency: string; status: string }; usage: { consumed: number; reserved: number }; clients: number; events: number };
type Client = { id: string; name: string; email: string | null; phone: string | null };
type Member = { id: string; subject: string; role: string; status: string };
type Event = { id: string; name: string; eventType: string; status: string; startAt: string | null; agencyClientEvents: Array<{ clientId: string }> };

async function api<T>(path = '', method = 'GET', data?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/agencies${path}`, { method, ...(data ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {}), cache: 'no-store' });
  const value: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value && typeof value === 'object' && 'message' in value && typeof value.message === 'string' ? value.message : 'La requête agence a échoué.');
  return value as T;
}

export function AgencyWorkspace({ initialAgencies, plans }: { initialAgencies: Agency[]; plans: AgencyPlan[] }) {
  const [agencies, setAgencies] = useState(initialAgencies);
  const [selectedId, setSelectedId] = useState(initialAgencies[0]?.id ?? '');
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const current = agencies.find((agency) => agency.id === selectedId) ?? null;
  async function refresh(workspaceId = selectedId) {
    if (!workspaceId) return;
    const [nextClients, nextMembers, nextEvents] = await Promise.all([api<Client[]>(`/${workspaceId}/clients`), api<Member[]>(`/${workspaceId}/members`), api<Event[]>(`/${workspaceId}/events`)]);
    setClients(nextClients); setMembers(nextMembers); setEvents(nextEvents); setLoaded(true);
    setAgencies(await api<Agency[]>());
  }
  async function act(operation: () => Promise<void>) { setBusy(true); setMessage(''); try { await operation(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Une erreur est survenue.'); } finally { setBusy(false); } }
  async function createAgency(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const name = String(new FormData(event.currentTarget).get('name') ?? ''); await act(async () => { const created = await api<Agency>('', 'POST', { name }); const next = await api<Agency[]>(); setAgencies(next); setSelectedId(created.id); await refresh(created.id); }); }
  async function createClient(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await act(async () => { await api(`/${selectedId}/clients`, 'POST', { name: form.get('name'), email: form.get('email') || null, phone: form.get('phone') || null }); event.currentTarget.reset(); await refresh(); }); }
  async function createMember(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await act(async () => { await api(`/${selectedId}/members`, 'POST', { subject: form.get('subject'), role: form.get('role') }); event.currentTarget.reset(); await refresh(); }); }
  async function createEvent(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const clientId = String(form.get('clientId') ?? ''); await act(async () => { await api(`/${selectedId}/events`, 'POST', { clientId, name: form.get('name'), eventType: form.get('eventType'), timezone: 'Africa/Kinshasa' }); event.currentTarget.reset(); await refresh(); }); }
  async function selectPlan(planKey: string) { await act(async () => { const result = await api<{ payment?: { checkoutUrl?: string | null } }>(`/${selectedId}/subscriptions`, 'POST', { planKey }); await refresh(); if (result.payment?.checkoutUrl) window.location.assign(result.payment.checkoutUrl); else setMessage('Commande créée · en attente du lien de paiement.'); }); }
  return <section className="agency-content">
    {message && <p role="status" className="agency-feedback">{message}</p>}
    <div className="agency-toolbar"><label>Workspace<select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setLoaded(false); void refresh(event.target.value).catch((error) => setMessage(error.message)); }}><option value="">Choisir une agence</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}</select></label><form onSubmit={createAgency}><input name="name" minLength={2} maxLength={120} required placeholder="Nom de l’agence"/><button disabled={busy}>Créer une agence</button></form></div>
    {!current ? <div className="agency-empty"><h2>Aucune agence</h2><p>Créez un workspace pour gérer vos clients et leurs événements.</p></div> : <>
      <section className="agency-overview"><div><small>ESPACE AGENCE</small><h2>{current.name}</h2><p>Rôle {current.role} · {current.status === 'ACTIVE' ? 'Actif' : 'Suspendu'}</p></div><div className="agency-metrics"><article><span>Plan</span><strong>{current.plan?.planName ?? 'Aucun plan actif'}</strong><small>{current.plan ? `${current.plan.status} · ${current.plan.priceMinor / 100} ${current.plan.currency}` : 'Sélectionnez un plan ci-dessous'}</small></article><article><span>Quota</span><strong>{current.usage.consumed} / {current.plan?.quotaCredits ?? 0}</strong><small>{current.usage.reserved} crédit(s) réservé(s)</small></article><article><span>Clients</span><strong>{current.clients}</strong></article><article><span>Événements</span><strong>{current.events}</strong></article><article><span>Membres</span><strong>{members.length || '—'}</strong></article></div></section>
      <section className="agency-section"><div className="agency-section-heading"><div><small>ABONNEMENT</small><h2>Plans disponibles</h2></div><span>Tarifs publiés · AGENCY</span></div>{plans.length ? <div className="agency-plans">{plans.map((plan) => <article key={plan.id}><h3>{plan.name}</h3><strong>{(plan.priceMinor / 100).toLocaleString('fr-FR')} {plan.currency}</strong><p>{plan.credits.toLocaleString('fr-FR')} crédits</p><button disabled={busy || current.role !== 'OWNER'} onClick={() => void selectPlan(plan.key)}>Demander ce plan</button></article>)}</div> : <p className="agency-empty-inline">Aucun plan agence n’est publié dans la grille tarifaire.</p>}<p className="agency-note">Une demande reste en attente jusqu’à la confirmation d’un paiement agence.</p></section>
      <div className="agency-columns"><section className="agency-section"><div className="agency-section-heading"><div><small>PORTefeuille CLIENT</small><h2>Clients</h2></div><span>{clients.length}</span></div>{loaded && clients.length === 0 ? <p className="agency-empty-inline">Aucun client dans ce workspace.</p> : clients.map((client) => <article className="agency-row" key={client.id}><strong>{client.name}</strong><span>{client.email ?? client.phone ?? 'Coordonnées non renseignées'}</span></article>)}{current.role !== 'MEMBER' && <form className="agency-form" onSubmit={createClient}><input name="name" required minLength={2} maxLength={120} placeholder="Nom du client"/><input name="email" type="email" placeholder="E-mail (optionnel)"/><input name="phone" placeholder="Téléphone (optionnel)"/><button disabled={busy}>Ajouter un client</button></form>}</section>
      <section className="agency-section"><div className="agency-section-heading"><div><small>COLLABORATION</small><h2>Membres</h2></div><span>{members.length}</span></div>{loaded && members.length === 0 ? <p className="agency-empty-inline">Aucun membre visible.</p> : members.map((member) => <article className="agency-row" key={member.id}><strong>{member.subject}</strong><span>{member.role} · {member.status}</span></article>)}{current.role === 'OWNER' && <form className="agency-form" onSubmit={createMember}><input name="subject" required maxLength={255} placeholder="Identifiant de compte Keycloak"/><select name="role"><option value="MEMBER">Membre</option><option value="ADMIN">Administrateur</option></select><button disabled={busy}>Ajouter un membre</button></form>}</section></div>
      <section className="agency-section"><div className="agency-section-heading"><div><small>PRODUCTION</small><h2>Événements</h2></div><span>{events.length}</span></div>{loaded && events.length === 0 ? <p className="agency-empty-inline">Aucun événement lié à un client.</p> : events.map((item) => <article className="agency-row" key={item.id}><strong><a href={`/events/${item.id}`}>{item.name}</a></strong><span>{item.eventType} · {item.status}</span></article>)}{clients.length > 0 && <form className="agency-form agency-event-form" onSubmit={createEvent}><input name="name" required minLength={2} maxLength={120} placeholder="Nom de l’événement"/><select name="clientId" required defaultValue=""><option value="" disabled>Client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><select name="eventType"><option value="WEDDING">Mariage</option><option value="BIRTHDAY">Anniversaire</option><option value="CONFERENCE">Conférence</option><option value="OTHER">Autre</option></select><button disabled={busy}>Créer un événement client</button></form>}</section>
      <button className="agency-refresh" onClick={() => void refresh().catch((error) => setMessage(error.message))} disabled={busy}>Actualiser les données</button>
    </>}
  </section>;
}
