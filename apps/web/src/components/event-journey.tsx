'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { deriveEventJourneyStatuses, eventJourneyStatusLabel, EVENT_JOURNEY_STEPS } from '@/lib/event-journey.mjs';

type StepId = 'event' | 'ceremonies' | 'guests' | 'seating' | 'designs' | 'invitations' | 'checkin';
type Facts = { guestCount: number | null; designCount: number | null; hasCompletedBatch: boolean | null };
type NextAction = { href?: string; label: string; note: string };

const routes = (eventId: string) => ({
  event: `/events/${encodeURIComponent(eventId)}`,
  ceremonies: `/events?event=${encodeURIComponent(eventId)}#ceremony-${encodeURIComponent(eventId)}`,
  guests: `/events/${encodeURIComponent(eventId)}/guests`,
  seating: `/events/${encodeURIComponent(eventId)}/seating`,
  designs: `/events/${encodeURIComponent(eventId)}/designs`,
  invitations: `/events/${encodeURIComponent(eventId)}/invitations`,
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
  eventStatus,
  loadFacts = true,
  nextActionOverride,
}: {
  eventId: string;
  activeStep: StepId;
  ceremonyCount: number;
  eventStatus?: string;
  loadFacts?: boolean;
  nextActionOverride?: NextAction;
}) {
  const [facts, setFacts] = useState<Facts>({ guestCount: null, designCount: null, hasCompletedBatch: null });
  const urls = useMemo(() => routes(eventId), [eventId]);

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
  }, [eventId, loadFacts]);

  const statuses = deriveEventJourneyStatuses({ ceremonyCount, ...facts });
  const activeIndex = EVENT_JOURNEY_STEPS.findIndex((step) => step.id === activeStep);
  const nextAction = nextActionOverride ?? (() => {
    if (activeStep === 'ceremonies') return ceremonyCount > 0
      ? { href: urls.guests, label: 'Continuer vers les invités', note: `${ceremonyCount} cérémonie(s) enregistrée(s).` }
      : { href: urls.ceremonies, label: 'Ajouter ma première cérémonie', note: 'La cérémonie peut être civile, religieuse, traditionnelle ou une réception.' };
    if (activeStep === 'guests' && ceremonyCount === 0) return { href: urls.ceremonies, label: 'Configurer une cérémonie', note: 'Ajoutez une première cérémonie avant de préparer les accès des invités.' };
    if (activeStep === 'guests') return facts.guestCount === null
      ? { href: undefined, label: 'Vérification des invités en cours', note: 'Les données de votre liste sont chargées depuis votre événement.' }
      : facts.guestCount === 0
        ? { href: '#guest-workspace', label: 'Ajouter ou importer mes invités', note: 'Ajoutez au moins un invité pour préparer les invitations.' }
        : { href: urls.designs, label: 'Continuer vers le design', note: `${facts.guestCount} invité(s) enregistré(s). Le placement reste facultatif.` };
    if (activeStep === 'seating') return { href: urls.designs, label: 'Passer au design', note: 'Le placement est facultatif et peut être complété plus tard.' };
    if (activeStep === 'designs') return facts.designCount === null
      ? { href: undefined, label: 'Vérification de vos designs en cours', note: 'Vos créations sont chargées depuis le service Design.' }
      : facts.designCount === 0
        ? { href: '#design-catalog', label: 'Choisir un modèle', note: 'Prévisualisez une composition avant de la personnaliser.' }
        : { href: urls.invitations, label: 'Continuer vers les invitations', note: 'Vous pourrez prévisualiser avant de lancer un lot.' };
    if (activeStep === 'invitations' && ceremonyCount === 0) return { href: urls.ceremonies, label: 'Configurer une cérémonie', note: 'La génération nécessite une cérémonie configurée.' };
    if (activeStep === 'invitations' && facts.guestCount === 0) return { href: urls.guests, label: 'Ajouter des invités', note: 'Ajoutez les personnes à inviter avant de préparer un lot.' };
    if (activeStep === 'invitations' && facts.designCount === 0) return { href: urls.designs, label: 'Choisir un modèle', note: 'Créez un design avant de préparer un lot.' };
    if (activeStep === 'invitations' && (facts.guestCount === null || facts.designCount === null)) return { href: undefined, label: 'Vérification des prérequis en cours', note: 'Les invités, le design, les accès et les crédits seront vérifiés avant toute génération.' };
    if (activeStep === 'invitations') return facts.hasCompletedBatch
      ? { href: urls.checkin, label: 'Ouvrir le pointage', note: 'Un lot terminé est disponible pour préparer l’accueil.' }
      : { href: '#invitation-generation', label: 'Préparer la génération', note: facts.hasCompletedBatch === null ? 'Chargement des lots réels…' : 'Le service vérifiera le design, les accès et les crédits avant la génération.' };
    if (activeStep === 'event') return { href: urls.ceremonies, label: 'Configurer les cérémonies', note: 'Ajoutez les horaires, lieux et informations utiles.' };
    return { href: undefined, label: 'Votre parcours est prêt pour le jour J', note: 'Scannez les QR et consultez le statut transmis par le service Access.' };
  })();

  const eventStatusLabel = ({ DRAFT: 'Brouillon', PUBLISHED: 'Publié', CANCELLED: 'Annulé', COMPLETED: 'Terminé' } as Record<string, string>)[eventStatus ?? ''] ?? eventStatus;

  return <section className="event-journey" style={{ '--journey-plum': 'var(--brand-purple,var(--check-plum,#32163a))', '--journey-plum-deep': '#24102a', '--journey-gold': 'var(--brand-gold,var(--check-gold,#bf9650))', '--journey-cream': 'var(--surface,var(--check-cream,#faf8f4))', '--journey-paper': 'var(--surface-raised,#fffdfa)', '--journey-border': 'var(--border-subtle,#e9e2d8)', '--journey-muted': 'var(--text-muted,#827c71)', '--journey-text': 'var(--text-primary,#28251f)' } as CSSProperties} aria-labelledby="event-journey-title" aria-live="polite">
    <div className="event-journey-heading"><div><p className="eyebrow">VOTRE PARCOURS</p><h2 id="event-journey-title">Étape {Math.max(activeIndex + 1, 1)} sur {EVENT_JOURNEY_STEPS.length}</h2></div>{eventStatusLabel && <span className="event-journey-event-status">{eventStatusLabel}</span>}</div>
    <nav aria-label="Étapes de préparation de l’événement"><ol className="event-journey-steps">{EVENT_JOURNEY_STEPS.map((step, index) => {
      const status = step.id === 'event' && activeStep === 'event' ? 'IN_PROGRESS' : statuses[step.id as keyof typeof statuses];
      const title = step.id === 'invitations' && status === 'BLOCKED'
        ? 'Configurez une cérémonie, ajoutez des invités et choisissez un design.'
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
  </section>;
}
