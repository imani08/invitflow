import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { JourneyDrafts } from '@/components/journey-drafts';
import './journey.css';
export default function EventsLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p role="status">Préparation de votre espace…</p>}><JourneyDrafts>{children}</JourneyDrafts></Suspense>;
}
