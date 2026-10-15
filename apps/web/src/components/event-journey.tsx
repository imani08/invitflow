'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { deriveEventJourneyStatuses, eventJourneyStatusLabel, EVENT_JOURNEY_STEPS } from '@/lib/event-journey.mjs';

type StepId = 'event' | 'ceremonies' | 'guests' | 'seating' | 'designs' | 'invitations' | 'checkin' | 'thanks';
type Facts = { guestCount: number | null; designCount: number | null; hasCompletedBatch: boolean | null };
type NextAction = { href?: string; label: string; note: string };

const routes = (eventId: string) => ({
  event: `/events/${encodeURIComponent(eventId)}`,
  ceremonies: `/events?event=${encodeURIComponent(eventId)}#ceremony-${encodeURIComponent(eventId)}`,
  guests: `/events/${encodeURIComponent(eventId)}/guests`,
  seating: `/events/${encodeURIComponent(eventId)}/seating`,
  designs: `/events/${encodeURIComponent(eventId)}/designs`,
  invitations: `/events/${encodeURIComponent(eventId)}/invitations`,
  thanks: `/events/${encodeURIComponent(eventId)}/invitations/merci`,
  checkin: `/events/${encodeURIComponent(eventId)}/check-in`,
});

async function readJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('journey_status_unavailable');
  return response.json();
}

function countFrom(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  if ('total' in value && typeof value.total === 'number' && Number.isSafeInteger(value.total) && value.total >= 0) return value.total;
  if ('items' in value && Array.isArray(value.items)) return value.items.length;
  return null;
}

function completedBatchFrom(value: unknown): boolean | null {
  const items = Array.isArray(value) ? value : value && typeof value === 'object' && 'items' in value && Array.isArray(value.items) ? value.items : null;
  if (!items) return null;
  if (items.some((item) => !!item && typeof item === 'object' && 'status' in item && item.status === 'COMPLETED')) return true;
  if (!Array.isArray(value) && value && typeof value === 'object' && 'nextCursor' in value && Boolean(value.nextCursor)) return null;
  return false;
}

export default function EventJourney({
  eventId,
  activeStep,
  ceremonyCount,
  eventType,
  eventStatus,
  loadFacts = true,
  nextActionOverride,
}: {
  eventId: string;
  activeStep: StepId;
  ceremonyCount: number;
  eventType?: string | undefined;
  eventStatus?: string;
  loadFacts?: boolean;
  nextActionOverride?: NextAction;
}) {
  const [facts, setFacts] = useState<Facts>({ guestCount: null, designCount: null, hasCompletedBatch: null });
  const [revision, setRevision] = useState(0);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  useEffect(() => {
    const update = (event: Event) => { if (event instanceof CustomEvent && event.detail === eventId) setRevision(value => value + 1); };
    window.addEventListener('invitaflow:journey-updated', update);
    return () => window.removeEventListener('invitaflow:journey-updated', update);
  }, [eventId]);
  const urls = useMemo(() => routes(eventId), [eventId]);
  const stepList = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = stepList.current;
    const current = list?.querySelector('li.is-current');
    if (!list || !current) return;
    const outer = list.getBoundingClientRect(), inner = current.getBoundingClientRect();
    list.scrollLeft += inner.left - outer.left - (outer.width - inner.width) / 2;
  }, [activeStep]);

  useEffect(() => {
    if (!loadFacts) return;
    const controller = new AbortController();
    const read = async (url: string, select: (value: unknown) => number | boolean | null) => {
      try { return select(await readJson(url, controller.signal)); }
      catch { return null; }
    };
    void Promise.all([
      read(`/api/events/${encodeURIComponent(eventId)}/guests?limit=1`, countFrom),
      read(`/api/events/${encodeURIComponent(eventId)}/designs`, countFrom),
      read(`/api/events/${encodeURIComponent(eventId)}/invitations/batches?limit=100`, completedBatchFrom),
    ]).then(([guestCount, designCount, hasCompletedBatch]) => {
      if (controller.signal.aborted) return;
      setFacts({
        guestCount: typeof guestCount === 'number' ? guestCount : null,
        designCount: typeof designCount === 'number' ? designCount : null,
        hasCompletedBatch: typeof hasCompletedBatch === 'boolean' ? hasCompletedBatch : null,
      });
    });
    return () => controller.abort();
  }, [eventId, loadFacts, revision]);

  const ceremonyRequired = eventType === 'WEDDING';
  const baseStatuses = deriveEventJourneyStatuses({ ceremonyCount, ceremonyRequired, ...facts });
  const statuses = eventStatus === 'COMPLETED'
    ? Object.fromEntries(Object.keys(baseStatuses).map((step) => [step, 'COMPLETED'])) as typeof baseStatuses
    : baseStatuses;
  const activeIndex = EVENT_JOURNEY_STEPS.findIndex((step) => step.id === activeStep);
  const updateLifecycle = async (action: 'complete' | 'cancel') => {
    const message = action === 'complete'
      ? 'Terminer cet événement ? Les données et les téléchargements resteront disponibles.'
      : 'Annuler cet événement ? Cette action arrête le programme et ne peut pas être annulée.';
    if (!window.confirm(message)) return;
    setLifecycleBusy(true);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error();
      window.dispatchEvent(new CustomEvent('invitaflow:journey-updated', { detail: eventId }));
      window.location.reload();
    } catch {
      window.alert(action === 'complete' ? 'La clôture a échoué. Réessayez dans un instant.' : 'L’annulation a échoué. Réessayez dans un instant.');
      setLifecycleBusy(false);
    }
  };
  const nextAction = nextActionOverride ?? (() => {
    if (activeStep === 'ceremonies') return ceremonyCount > 0
      ? { href: urls.designs, label: 'Découvrir mes propositions', note: `${ceremonyCount} cérémonie(s) enregistrée(s).` }
      : ceremonyRequired
        ? { href: urls.ceremonies, label: 'Ajouter ma première cérémonie', note: 'La cérémonie peut être civile, religieuse, traditionnelle ou une réception.' }
        : { href: urls.designs, label: 'Découvrir mes propositions', note: 'Le programme est facultatif pour ce type d’événement.' };
    if (activeStep === 'guests' && ceremonyRequired && ceremonyCount === 0) return { href: urls.ceremonies, label: 'Configurer une cérémonie', note: 'Ajoutez une première cérémonie avant de préparer les accès des invités.' };
    if (activeStep === 'guests') return facts.guestCount === null
      ? { href: undefined, label: 'Vérification des invités en cours', note: 'Les données de votre liste sont chargées depuis votre événement.' }
      : facts.guestCount === 0
        ? { href: '#guest-workspace', label: 'Ajouter ou importer mes invités', note: 'Ajoutez au moins un invité pour préparer les invitations.' }
        : { href: urls.invitations, label: 'Vérifier mes invitations', note: `${facts.guestCount} invité(s) enregistré(s). Le placement reste facultatif.` };
    if (activeStep === 'seating') return { href: urls.invitations, label: 'Vérifier mes invitations', note: 'Le placement est facultatif et peut être complété plus tard.' };
    if (activeStep === 'designs') return facts.designCount === null
      ? { href: undefined, label: 'Vérification de vos designs en cours', note: 'Vos créations sont chargées depuis le service Design.' }
      : facts.designCount === 0
        ? { href: '#design-catalog', label: 'Choisir un modèle', note: 'Prévisualisez une composition avant de la personnaliser.' }
        : { href: urls.guests, label: 'Continuer vers les invités', note: 'Vous pourrez prévisualiser avant de lancer un lot.' };
    if (activeStep === 'invitations' && ceremonyRequired && ceremonyCount === 0) return { href: urls.ceremonies, label: 'Configurer une cérémonie', note: 'La génération nécessite une cérémonie configurée pour un mariage.' };
    if (activeStep === 'invitations' && facts.guestCount === 0) return { href: urls.guests, label: 'Ajouter des invités', note: 'Ajoutez les personnes à inviter avant de préparer un lot.' };
    if (activeStep === 'invitations' && facts.designCount === 0) return { href: urls.designs, label: 'Choisir un modèle', note: 'Créez un design avant de préparer un lot.' };
    if (activeStep === 'invitations' && (facts.guestCount === null || facts.designCount === null)) return { href: undefined, label: 'Vérification des prérequis en cours', note: 'Les invités, le design, les accès et les crédits seront vérifiés avant toute génération.' };
    if (activeStep === 'invitations') return facts.hasCompletedBatch
      ? { href: urls.checkin, label: 'Préparer le pointage', note: 'Créez les liens sécurisés pour l’accueil le jour J.' }
      : { href: '#invitation-generation', label: 'Préparer la génération', note: facts.hasCompletedBatch === null ? 'Chargement des lots réels…' : 'Le service vérifiera le design, les accès et les crédits avant la génération.' };
    if (activeStep === 'checkin') return { href: urls.thanks, label: 'Continuer vers Merci', note: 'Le pointage est prêt : vous pourrez scanner les QR le jour J.' };
    if (activeStep === 'thanks') return { href: urls.event, label: 'Revenir à mon événement', note: 'Vos données enregistrées restent disponibles.' };
    if (activeStep === 'event') return { href: urls.ceremonies, label: ceremonyRequired ? 'Configurer les cérémonies' : 'Configurer le programme (facultatif)', note: ceremonyRequired ? 'Ajoutez les horaires, lieux et informations utiles.' : 'Ajoutez des moments seulement si votre événement en a besoin.' };
    return { href: undefined, label: 'Votre parcours est prêt pour le jour J', note: 'Scannez les QR et consultez le statut transmis par le service Access.' };
  })();

  const eventStatusLabel = ({ DRAFT: 'Brouillon', PUBLISHED: 'Publié', CANCELLED: 'Annulé', COMPLETED: 'Terminé' } as Record<string, string>)[eventStatus ?? ''] ?? eventStatus;

  return <section className="event-journey" style={{ '--journey-plum': 'var(--brand-purple,var(--check-plum,#32163a))', '--journey-plum-deep': '#24102a', '--journey-gold': 'var(--brand-gold,var(--check-gold,#bf9650))', '--journey-cream': 'var(--surface,var(--check-cream,#faf8f4))', '--journey-paper': 'var(--surface-raised,#fffdfa)', '--journey-border': 'var(--border-subtle,#e9e2d8)', '--journey-muted': 'var(--text-muted,#827c71)', '--journey-text': 'var(--text-primary,#28251f)' } as CSSProperties} aria-labelledby="event-journey-title" aria-live="polite">
    <div className="event-journey-heading"><div><p className="eyebrow">VOTRE PARCOURS</p><h2 id="event-journey-title">{activeIndex < 0 ? 'Outil complémentaire' : `Étape ${activeIndex + 1} sur ${EVENT_JOURNEY_STEPS.length}`}</h2></div>{eventStatusLabel && <span className="event-journey-event-status">{eventStatusLabel}</span>}</div>
    <p className="event-journey-help">Avancez à votre rythme. Les données enregistrées restent disponibles en revenant à une étape.</p>
    <nav aria-label="Étapes de préparation de l’événement"><ol ref={stepList} className="event-journey-steps">{EVENT_JOURNEY_STEPS.map((step, index) => {
      const status = step.id === 'event' && activeStep === 'event' && eventStatus !== 'COMPLETED' ? 'IN_PROGRESS' : statuses[step.id as keyof typeof statuses];
      const title = step.id === 'invitations' && status === 'BLOCKED'
        ? ceremonyRequired ? 'Configurez une cérémonie, ajoutez des invités et choisissez un design.' : 'Ajoutez des invités et choisissez un design.'
        : step.id === 'checkin' && status === 'BLOCKED'
          ? 'Le pointage sera prêt après la génération d’un lot terminé.'
          : `${step.label} · ${eventJourneyStatusLabel(status)}`;
      return <li key={step.id} className={step.id === activeStep ? 'is-current' : ''} data-status={status}>
        <Link href={urls[step.id as keyof typeof urls]} aria-current={step.id === activeStep ? 'step' : undefined} title={title}>
          <span className="event-journey-number">{status === 'COMPLETED' ? '✓' : String(index + 1).padStart(2, '0')}</span>
          <span className="event-journey-label">{step.label}{step.id === 'seating' && <small>Facultatif</small>}</span>
          <span className="event-journey-status">{eventJourneyStatusLabel(status)}</span>
        </Link>
      </li>;
    })}</ol></nav>
    <div className="event-journey-next"><div><strong>{nextAction.label}</strong><p>{nextAction.note}</p></div>{nextAction.href && <Link href={nextAction.href}>{nextAction.label}<span aria-hidden="true"> →</span></Link>}</div>
    {['DRAFT', 'PUBLISHED'].includes(eventStatus ?? '') && <div className="event-journey-lifecycle"><span>Disponible à chaque étape</span><button type="button" disabled={lifecycleBusy} onClick={() => void updateLifecycle('complete')}>{lifecycleBusy ? 'Mise à jour…' : 'Terminer l’événement'}</button><button type="button" disabled={lifecycleBusy} onClick={() => void updateLifecycle('cancel')}>Annuler l’événement</button></div>}
    <nav className="event-journey-secondary" aria-label="Retour et outils complémentaires"><Link href={activeIndex > 0 ? urls[EVENT_JOURNEY_STEPS[activeIndex - 1]!.id as keyof typeof urls] : '/events'}>← {activeIndex > 0 ? 'Étape précédente' : 'Tous mes événements'}</Link><Link href={urls.seating}>Placement (facultatif)</Link></nav>
  </section>;
}
