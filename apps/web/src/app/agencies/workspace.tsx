'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { agencyPeriod, agencyCreditUsage, belongsToAgencyClient } from './agency-period.mjs';

export type AgencyPlan = { id: string; key: string; name: string; credits: number; periodDays?: number | null; priceMinor: number; currency: string; segment: string };
export type Agency = { id: string; name: string; status: string; role: 'OWNER' | 'ADMIN' | 'MEMBER'; plan: null | { planName: string; quotaCredits: number; priceMinor: number; currency: string; status: string; billingPeriodStart?: string | null; billingPeriodEnd?: string | null }; usage: { consumed: number; reserved: number }; clients: number; events: number };
type Client = { id: string; name: string; email: string | null; phone: string | null };
type Member = { id: string; subject: string; role: string; status: string; createdAt?: string };
type Event = { id: string; name: string; eventType: string; status: string; startAt: string | null; agencyClientEvents?: Array<{ clientId: string }> };

async function api<T>(path = '', method = 'GET', data?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/agencies${path}`, { method, ...(data ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {}), cache: 'no-store' });
  const value: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value && typeof value === 'object' && 'message' in value && typeof value.message === 'string' ? value.message : 'La requête agence a échoué.');
  return value as T;
}

const roleLabels: Record<string, string> = { OWNER: 'Propriétaire', ADMIN: 'Administrateur', MEMBER: 'Membre' };
const memberStatusLabels: Record<string, string> = { ACTIVE: 'Actif', SUSPENDED: 'Suspendu', REMOVED: 'Retiré' };
const subscriptionLabels: Record<string, string> = { PENDING: 'En attente du paiement', ACTIVE: 'Actif', PAST_DUE: 'Période échue', SUSPENDED: 'Suspendu', CANCELLED: 'Annulé' };
const eventTypeLabels: Record<string, string> = { WEDDING: 'Mariage', BIRTHDAY: 'Anniversaire', CONFERENCE: 'Conférence', OTHER: 'Autre' };
const eventStatusLabels: Record<string, string> = { DRAFT: 'Brouillon', PUBLISHED: 'Publié', CANCELLED: 'Annulé', COMPLETED: 'Terminé' };

function localDateTimeInZone(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(value);
  if (!match) throw new Error('Saisissez une date et une heure valides.');
  const target = match.slice(1).map(Number);
  const targetUtc = Date.UTC(target[0]!, target[1]! - 1, target[2]!, target[3]!, target[4]!);
  let candidate = targetUtc;
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts['year']), Number(parts['month']) - 1, Number(parts['day']), Number(parts['hour']), Number(parts['minute']));
    const adjustment = targetUtc - represented;
    candidate += adjustment;
    if (!adjustment) break;
  }
  const actual = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
  if (Number(actual['year']) !== target[0] || Number(actual['month']) !== target[1] || Number(actual['day']) !== target[2] || Number(actual['hour']) !== target[3] || Number(actual['minute']) !== target[4]) throw new Error('Cette heure ne peut pas être représentée dans le fuseau de l’événement.');
  return new Date(candidate).toISOString();
}

export function AgencyWorkspace({ initialAgencies, plans }: { initialAgencies: Agency[]; plans: AgencyPlan[] }) {
  const [agencies, setAgencies] = useState(initialAgencies);
  const [selectedId, setSelectedId] = useState(initialAgencies[0]?.id ?? '');
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selectedPlanKey, setSelectedPlanKey] = useState('');
  const [createdEvent, setCreatedEvent] = useState<{ event: Event; clientId: string } | null>(null);
  const requestGeneration = useRef(0);
  const actionInFlight = useRef(false);
  const current = agencies.find((agency) => agency.id === selectedId) ?? null;
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;

  const refresh = useCallback(async (workspaceId = selectedId) => {
    if (!workspaceId) { setClients([]); setMembers([]); setEvents([]); setLoaded(true); return; }
    const generation = ++requestGeneration.current;
    setLoading(true);
    try {
      const [nextClients, nextMembers, nextEvents, nextAgencies] = await Promise.all([
        api<Client[]>(`/${workspaceId}/clients`), api<Member[]>(`/${workspaceId}/members`), api<Event[]>(`/${workspaceId}/events`), api<Agency[]>(),
      ]);
      if (generation !== requestGeneration.current) return;
      setClients(nextClients); setMembers(nextMembers); setEvents(nextEvents); setAgencies(nextAgencies); setLoaded(true);
    } finally { if (generation === requestGeneration.current) setLoading(false); }
  }, [selectedId]);

  useEffect(() => {
    setLoaded(false); setMessage('');
    void refresh(selectedId).catch((error) => setMessage(error instanceof Error ? error.message : 'Chargement de l’agence impossible.'));
  }, [refresh, selectedId]);

  async function act(operation: () => Promise<void>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true); setMessage('');
    try { await operation(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Une erreur est survenue.'); }
    finally { actionInFlight.current = false; setBusy(false); }
  }

  async function createAgency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const name = String(new FormData(form).get('name') ?? '');
    await act(async () => { const created = await api<Agency>('', 'POST', { name }); const next = await api<Agency[]>(); setAgencies(next); setSelectedId(created.id); form.reset(); setMessage('Agence créée. Chargement de son espace…'); });
  }
  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await act(async () => { await api(`/${selectedId}/clients`, 'POST', { name: data.get('name'), email: data.get('email') || null, phone: data.get('phone') || null }); form.reset(); await refresh(); setMessage('Client ajouté.'); });
  }
  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await act(async () => { await api(`/${selectedId}/members`, 'POST', { subject: data.get('subject'), role: data.get('role') }); form.reset(); await refresh(); setMessage('Compte ajouté à l’équipe.'); });
  }
  async function updateMember(member: Member, change: { role?: string; status?: string }) {
    await act(async () => { await api(`/${selectedId}/members/${member.id}`, 'PATCH', change); await refresh(); setMessage('Accès membre mis à jour.'); });
  }
  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const clientId = String(data.get('clientId') ?? '');
    await act(async () => {
      const created = await api<Event>(`/${selectedId}/events`, 'POST', { clientId, name: data.get('name'), eventType: data.get('eventType'), timezone: 'Africa/Kinshasa', ...(data.get('startAt') ? { startAt: localDateTimeInZone(String(data.get('startAt')), 'Africa/Kinshasa') } : {}) });
      setCreatedEvent({ event: created, clientId }); setSelectedClientId(clientId); form.reset(); await refresh(); setMessage('Événement créé. Ouvrez son espace pour configurer cérémonies, invités et invitations.');
    });
  }
  async function startCheckout() {
    const planKey = selectedPlanKey; if (!planKey) return;
    await act(async () => { const result = await api<{ payment?: { checkoutUrl?: string | null } }>(`/${selectedId}/subscriptions`, 'POST', { planKey }); await refresh(); if (result.payment?.checkoutUrl) window.location.assign(result.payment.checkoutUrl); else setMessage('Demande créée · le paiement est en attente de confirmation ou de reprise.'); });
  }

  const filteredClients = clients.filter((client) => `${client.name} ${client.email ?? ''} ${client.phone ?? ''}`.toLocaleLowerCase('fr-FR').includes(clientSearch.trim().toLocaleLowerCase('fr-FR')));
  const visibleEvents = selectedClient ? [
    ...events.filter((item) => belongsToAgencyClient(item, selectedClient.id)),
    ...(createdEvent?.clientId === selectedClient.id && !events.some((item) => belongsToAgencyClient(item, selectedClient.id) && item.id === createdEvent.event.id) ? [createdEvent.event] : []),
  ] : events;
  const creditUsage = agencyCreditUsage(current?.plan ? { status: current.plan.status, quotaCredits: current.plan.quotaCredits } : null, current?.usage ?? { consumed: 0, reserved: 0 });
  const canManageTeam = current?.role === 'OWNER' || current?.role === 'ADMIN';

  return <section className="agency-content" aria-busy={loading}>
    {message && <p role="status" className="agency-feedback">{message}</p>}
    <div className="agency-toolbar"><label>Workspace<select value={selectedId} disabled={busy} onChange={(event) => { setSelectedId(event.target.value); setSelectedClientId(''); }}><option value="">Choisir une agence</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}</select></label><form onSubmit={createAgency}><input name="name" minLength={2} maxLength={120} required placeholder="Nom de l’agence" aria-label="Nom de la nouvelle agence"/><button disabled={busy}>Créer une agence</button></form></div>
    {loading && !loaded && <div className="agency-empty" role="status"><p>Chargement des données de l’agence…</p></div>}
    {!current ? <div className="agency-empty"><h2>Aucune agence</h2><p>Créez un workspace pour gérer des clients et leurs événements.</p></div> : <>
      <section className="agency-overview" aria-label="Tableau de bord agence">
        <div className="agency-overview-heading"><div><small>ESPACE AGENCE</small><h2>{current.name}</h2><p>{roleLabels[current.role] ?? current.role} · {current.status === 'ACTIVE' ? 'Espace actif' : 'Espace suspendu'}</p></div><button className="agency-refresh" onClick={() => void refresh().catch((error) => setMessage(error.message))} disabled={busy || loading}>Actualiser</button></div>
        <div className="agency-metrics"><article><span>Clients</span><strong>{current.clients.toLocaleString('fr-FR')}</strong></article><article><span>Événements</span><strong>{current.events.toLocaleString('fr-FR')}</strong></article><article><span>Membres visibles</span><strong>{loaded ? members.length.toLocaleString('fr-FR') : '—'}</strong></article></div>
        <div className="agency-resource-summary"><article><span>Abonnement</span><strong>{current.plan?.planName ?? 'Aucun abonnement'}</strong><small>{current.plan ? subscriptionLabels[current.plan.status] ?? current.plan.status : 'Choisissez un plan ci-dessous'}</small></article><article><span>Crédits inclus dans le plan</span><strong>{creditUsage.included === null ? 'Non disponibles' : `${creditUsage.included.toLocaleString('fr-FR')} crédits`}</strong><small>{creditUsage.consumed === null ? 'Un quota apparaît après activation confirmée' : `${creditUsage.consumed.toLocaleString('fr-FR')} consommés · ${creditUsage.reserved?.toLocaleString('fr-FR')} réservés`}</small></article><article><span>Crédits disponibles</span><strong>{creditUsage.available === null ? '—' : `${creditUsage.available.toLocaleString('fr-FR')} crédits`}</strong><small>Calculé depuis le quota actif et les réservations serveur</small></article></div>
        {current.plan?.billingPeriodStart && current.plan.billingPeriodEnd && (() => { const period = agencyPeriod(current.plan.billingPeriodStart, current.plan.billingPeriodEnd); if (!period) return <p className="agency-note">Période historique sans durée vérifiable; aucun décompte approximatif n’est affiché.</p>; return <div className="agency-period" aria-label={period.active ? `Jour ${period.day} sur 30, ${period.daysRemaining} jour(s) restant(s)` : period.expired ? 'Abonnement expiré' : 'Période à venir'}><div><strong>{period.active ? `Jour ${period.day} sur 30` : period.expired ? 'Période terminée' : 'Période à venir'}</strong><span>{period.active ? `${period.daysRemaining} jour(s) restant(s)` : 'Période de 30 jours'}</span></div><progress max="100" value={period.progress}/><small>Début : {new Date(period.start).toLocaleDateString('fr-FR')} · Fin : {new Date(period.end).toLocaleDateString('fr-FR')}</small></div>; })()}
      </section>

      <section className="agency-section" id="clients"><div className="agency-section-heading"><div><small>RELATIONS CLIENTS</small><h2>Clients</h2></div><span>{current.clients.toLocaleString('fr-FR')}</span></div>
        <label className="agency-search">Rechercher un client<input type="search" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Nom, e-mail ou téléphone"/></label>
        {loading && !loaded ? <p className="agency-empty-inline">Chargement des clients…</p> : filteredClients.length ? <div className="agency-client-layout"><div className="agency-client-list" aria-label="Liste des clients">{filteredClients.map((client) => <button type="button" className={`agency-client-card${client.id === selectedClientId ? ' is-selected' : ''}`} key={client.id} onClick={() => setSelectedClientId(client.id)}><strong>{client.name}</strong><span>{client.email ?? client.phone ?? 'Coordonnées non renseignées'}</span></button>)}</div>{selectedClient && <aside className="agency-client-detail" aria-label={`Détail client ${selectedClient.name}`}><small>DÉTAIL DU CLIENT</small><h3>{selectedClient.name}</h3><p>{selectedClient.email ?? 'E-mail non renseigné'}</p><p>{selectedClient.phone ?? 'Téléphone non renseigné'}</p><button type="button" onClick={() => { setSelectedClientId(selectedClient.id); document.getElementById('create-event')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }}>Créer un événement pour ce client</button><p className="agency-note">La modification du profil client n’est pas fournie par l’API.</p></aside>}</div> : <div className="agency-empty-inline">{loaded ? 'Aucun client correspondant. Ajoutez un client pour démarrer.' : 'Les clients seront affichés après chargement.'}</div>}
        <form className="agency-form" onSubmit={createClient}><h3>Ajouter un client</h3><input name="name" required minLength={2} maxLength={120} placeholder="Nom du client" aria-label="Nom du client"/><input name="email" type="email" maxLength={320} placeholder="E-mail (facultatif)" aria-label="E-mail du client"/><input name="phone" maxLength={40} placeholder="Téléphone (facultatif)" aria-label="Téléphone du client"/><button disabled={busy || current.status !== 'ACTIVE'}>{busy ? 'Enregistrement…' : 'Ajouter le client'}</button></form>
      </section>

      <section className="agency-section" id="events"><div className="agency-section-heading"><div><small>PRODUCTION</small><h2>{selectedClient ? `Événements · ${selectedClient.name}` : 'Événements'}</h2></div><span>{visibleEvents.length.toLocaleString('fr-FR')}</span></div>
        {loaded && visibleEvents.length === 0 ? <p className="agency-empty-inline">{selectedClient ? 'Aucun événement associé à ce client n’est renvoyé par l’API actuelle.' : 'Aucun événement dans cette agence.'}</p> : visibleEvents.map((item) => <article className="agency-row" key={item.id}><div><strong><Link href={`/events/${encodeURIComponent(item.id)}`}>{item.name}</Link></strong><small>{eventTypeLabels[item.eventType] ?? item.eventType}{item.startAt ? ` · ${new Date(item.startAt).toLocaleDateString('fr-FR')}` : ''}</small></div><span>{eventStatusLabels[item.status] ?? item.status}</span></article>)}
        {clients.length > 0 && <form className="agency-form agency-event-form" id="create-event" onSubmit={createEvent}><h3>Créer un événement client</h3><input name="name" required minLength={2} maxLength={120} placeholder="Nom de l’événement" aria-label="Nom de l’événement"/><select name="clientId" required value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}><option value="">Choisir le client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><select name="eventType" defaultValue="WEDDING" aria-label="Type d’événement"><option value="WEDDING">Mariage</option><option value="BIRTHDAY">Anniversaire</option><option value="CONFERENCE">Conférence</option><option value="OTHER">Autre</option></select><input name="startAt" type="datetime-local" aria-label="Date et heure facultatives"/><small>La suite utilise le même espace Événements : cérémonies, invités, placement et invitations.</small><button disabled={busy || current.status !== 'ACTIVE'}>{busy ? 'Création…' : 'Créer l’événement'}</button></form>}
        {createdEvent && <p className="agency-feedback">Dernier événement créé : <Link href={`/events/${encodeURIComponent(createdEvent.event.id)}`}>{createdEvent.event.name} · Ouvrir son espace</Link></p>}
        {clients.length === 0 && <p className="agency-empty-inline">Ajoutez d’abord un client depuis la section <a href="#clients">Clients</a> pour pouvoir créer un événement associé.</p>}
      </section>

      <section className="agency-section" id="team"><div className="agency-section-heading"><div><small>COLLABORATION</small><h2>Équipe</h2></div><span>{loaded ? members.length.toLocaleString('fr-FR') : '—'}</span></div>
        {!loaded ? <p className="agency-empty-inline">Chargement de l’équipe…</p> : members.length ? members.map((member) => { const mayManage = current.role === 'OWNER' || current.role === 'ADMIN' && member.role === 'MEMBER'; const mayChangeRole = current.role === 'OWNER' && member.role !== 'OWNER'; return <article className="agency-row agency-member-row" key={member.id}><div><strong>{roleLabels[member.role] === 'Propriétaire' ? 'Propriétaire du workspace' : 'Compte membre'}</strong><small>{roleLabels[member.role] ?? member.role} · {memberStatusLabels[member.status] ?? member.status}{member.createdAt ? ` · Ajouté le ${new Date(member.createdAt).toLocaleDateString('fr-FR')}` : ''}</small></div>{mayManage && member.role !== 'OWNER' && <span className="agency-member-actions">{mayChangeRole && <select aria-label="Rôle du membre" value={member.role} disabled={busy} onChange={(event) => void updateMember(member, { role: event.target.value })}><option value="MEMBER">Membre</option><option value="ADMIN">Administrateur</option></select>}<button type="button" disabled={busy} onClick={() => void updateMember(member, { status: member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>{member.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}</button><button type="button" disabled={busy} onClick={() => { if (window.confirm('Retirer ce compte de l’agence ?')) void updateMember(member, { status: 'REMOVED' }); }}>Retirer</button></span>}</article>; }) : <p className="agency-empty-inline">Aucun membre visible.</p>}
        {canManageTeam && <form className="agency-form" onSubmit={createMember}><h3>Associer un compte existant</h3><p className="agency-note">L’API accepte un identifiant de compte Keycloak existant; elle ne fournit pas d’invitation par e-mail.</p><input name="subject" required maxLength={255} placeholder="Identifiant de compte Keycloak" aria-label="Identifiant de compte Keycloak"/><select name="role" defaultValue="MEMBER" aria-label="Rôle du nouveau membre"><option value="MEMBER">Membre</option>{current.role === 'OWNER' && <option value="ADMIN">Administrateur</option>}</select><button disabled={busy}>{busy ? 'Ajout…' : 'Ajouter à l’équipe'}</button></form>}
      </section>

      <section className="agency-section" id="subscription"><div className="agency-section-heading"><div><small>ABONNEMENT & FACTURATION</small><h2>Plans agence</h2></div><span>Tarifs publiés par Billing</span></div><p className="agency-note">Le plan ne devient actif qu’après confirmation serveur du paiement. Les montants ci-dessous sont des prix d’achat; ce ne sont pas des crédits Wallet.</p>
        {plans.length ? <div className="agency-plans">{plans.map((plan) => <article className={selectedPlanKey === plan.key ? 'agency-plan-selected' : ''} key={plan.id}><h3>{plan.name}</h3><strong>{formatMoney(plan.priceMinor, plan.currency)}{plan.periodDays ? ` / ${plan.periodDays} jours` : ''}</strong><p>{plan.credits.toLocaleString('fr-FR')} crédits inclus{plan.periodDays ? ` · ${plan.periodDays} jours` : ''}</p>{current.plan?.planName === plan.name && <small>Plan renvoyé par l’abonnement : {subscriptionLabels[current.plan.status] ?? current.plan.status}</small>}<button disabled={busy || current.role !== 'OWNER' || current.status !== 'ACTIVE'} onClick={() => setSelectedPlanKey(plan.key)}>{selectedPlanKey === plan.key ? 'Plan sélectionné' : 'Examiner le plan'}</button></article>)}</div> : <p className="agency-empty-inline">Aucun plan agence publié par Billing.</p>}
        {selectedPlanKey && (() => { const plan = plans.find((item) => item.key === selectedPlanKey); if (!plan) return null; return <div className="agency-checkout-explainer"><h3>Récapitulatif · {plan.name}</h3><dl><div><dt>Crédits inclus</dt><dd>{plan.credits.toLocaleString('fr-FR')} crédits</dd></div><div><dt>Prix publié</dt><dd>{formatMoney(plan.priceMinor, plan.currency)}</dd></div>{plan.periodDays ? <div><dt>Période</dt><dd>{plan.periodDays} jours</dd></div> : null}</dl><p>La souscription restera en attente tant que le serveur Payments n’aura pas confirmé la transaction.</p><button disabled={busy} onClick={() => void startCheckout()}>{busy ? 'Préparation…' : 'Continuer vers le paiement'}</button><button className="agency-cancel-selection" type="button" disabled={busy} onClick={() => setSelectedPlanKey('')}>Retour aux plans</button></div>; })()}
        <p className="agency-note">L’historique des factures/paiements et les paramètres agence ne sont pas exposés par les endpoints disponibles.</p>
      </section>
    </>}
  </section>;
}

function formatMoney(priceMinor: number, currency: string) {
  const digits = new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(priceMinor / (10 ** digits));
}
