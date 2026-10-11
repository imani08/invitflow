// Offline component QA only: mounts the actual workspace with explicit fixture data.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DesignsWorkspace } from '../../apps/web/src/app/events/[eventId]/designs/workspace';
import { ThemeProvider } from '../../apps/web/src/components/theme-provider';
import { InvitationConfirmation } from '../../apps/web/src/app/events/[eventId]/invitations/merci/confirmation';
import EventJourney from '../../apps/web/src/components/event-journey';
import { EventsWorkspace } from '../../apps/web/src/app/events/workspace';
import type { Event } from '../../apps/web/src/app/events/types';
import { GuestsWorkspace } from '../../apps/web/src/app/events/[eventId]/guests/workspace';
import { InvitationsWorkspace } from '../../apps/web/src/app/events/[eventId]/invitations/workspace';
const event = (window as unknown as { __qaEvent: React.ComponentProps<typeof DesignsWorkspace>['event'] }).__qaEvent;
const thanks = new URLSearchParams(location.search).has('thanks');
const stage = new URLSearchParams(location.search).get('stage');
const fullEvent = { ...event, description: null, endAt: null, ceremonies: event.ceremonies.map(item => ({ ...item, status: 'DRAFT', timezone: 'Africa/Kinshasa', programItems: [] })) } as Event;
createRoot(document.getElementById('root')!).render(<ThemeProvider>{stage === 'events' || stage === 'ceremonies' ? <EventsWorkspace initialEvents={[fullEvent]} expandedEventId={stage === 'ceremonies' ? event.id : undefined} /> : stage === 'guests' ? <main><EventJourney eventId={event.id} activeStep="guests" ceremonyCount={event.ceremonies.length} /><GuestsWorkspace event={fullEvent} /></main> : stage === 'invitations' ? <main><EventJourney eventId={event.id} activeStep="invitations" ceremonyCount={event.ceremonies.length} /><InvitationsWorkspace eventId={event.id} eventName={event.name} /></main> : thanks ? <main className="events-content"><EventJourney eventId={event.id} activeStep="thanks" ceremonyCount={event.ceremonies.length} loadFacts={false} /><InvitationConfirmation eventId={event.id} eventName={event.name} batchId="dddddddd-dddd-4ddd-8ddd-dddddddddddd" /></main> : <DesignsWorkspace event={event} />}</ThemeProvider>);
