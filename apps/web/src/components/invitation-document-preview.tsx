'use client';
import { useEffect, useState } from 'react';
import { renderResolvedLayoutSvg, resolveDesignLayout, invitationDisplayFields } from '@invitaflow/design-document';
import { loadPrivateMediaPreview } from '@/lib/private-media-preview.mjs';
import { parseDesignEvent } from '@/lib/design-event-contract.mjs';

/** Uses the shared renderer and authenticated records; the real QR is created only by Invitations. */
export default function InvitationDocumentPreview({ eventId, guestId, document }: { eventId: string; guestId?: string | undefined; document: unknown }) {
  const [svg, setSvg] = useState(''); const [error, setError] = useState('');
  const documentKey = JSON.stringify(document);
  useEffect(() => {
    const controller = new AbortController(); const urls: string[] = [];
    setSvg(''); setError('');
    async function get(path: string) {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}${path}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Les données de cet aperçu sont momentanément indisponibles.');
      return response.json();
    }
    void (async () => {
      const [rawEvent, guest] = await Promise.all([get(''), guestId ? get(`/guests/${encodeURIComponent(guestId)}`) : Promise.resolve(null)]);
      const event = parseDesignEvent(rawEvent);
      if (guest && !Array.isArray(guest.access)) throw new Error('Les accès de cet invité sont incomplets.');
      const ceremonies = event.ceremonies.filter((ceremony: { id: string }) => !guest || guest.access.some((access: { ceremonyId: string; isInvited: boolean }) => access.ceremonyId === ceremony.id && access.isInvited));
      const parsed = JSON.parse(documentKey);
      if (!Array.isArray(parsed.elements)) throw new Error('Le document sélectionné est incomplet.');
      const assets = Object.fromEntries(await Promise.all([...new Set(parsed.elements.filter((layer: { type: string }) => layer.type === 'IMAGE').map((layer: { assetId: string }) => layer.assetId))].map(async id => {
        const url = await loadPrivateMediaPreview(String(id));
        if (controller.signal.aborted) URL.revokeObjectURL(url); else urls.push(url);
        return [String(id), url];
      })));
      const snapshot = {
        guest: { name: guest?.fullName ?? '', email: guest?.email ?? '' }, table: { name: '' },
        ...invitationDisplayFields({ ...event, ceremonies }),
        qr: { available: false },
      };
      const layout = resolveDesignLayout(parsed, snapshot, undefined, assets, { mode: 'web' });
      if (!controller.signal.aborted) setSvg(renderResolvedLayoutSvg(layout, { assets }));
    })().catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Aperçu indisponible.'); });
    return () => { controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [eventId, guestId, documentKey]);
  return <section aria-label="Aperçu de la composition sélectionnée"><p>Composition sélectionnée · accès aux cérémonies de cet invité. Les tables et le QR individuel sont vérifiés et ajoutés au rendu final.</p>{error ? <p role="alert">{error}</p> : svg ? <div style={{ maxWidth: 420, margin: 'auto' }} dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg style="width:100%;height:auto;display:block" ') }} /> : <p role="status">Préparation de l’aperçu et des médias privés…</p>}</section>;
}
