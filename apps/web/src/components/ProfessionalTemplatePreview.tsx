'use client';
import { useEffect, useState } from 'react';
import { renderResolvedLayoutSvg, resolveDesignLayout, type DesignDocument, type RenderSnapshot } from '@invitaflow/design-document';
import { loadPrivateMediaPreview } from '@/lib/private-media-preview.mjs';

export default function ProfessionalTemplatePreview({ eventId, templateId, snapshot }: { eventId: string; templateId: string; snapshot: RenderSnapshot }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const snapshotKey = JSON.stringify(snapshot);
  useEffect(() => {
    let cancelled = false;
    const blobs: string[] = [];
    setSvg(''); setError('');
    void (async () => {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/designs/templates/${encodeURIComponent(templateId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Le modèle ne peut pas être chargé.');
      const { document } = await response.json() as { document: DesignDocument };
      const entries = await Promise.all([...new Set(document.elements.filter((layer) => layer['type'] === 'IMAGE').map((layer) => String(layer['assetId'])))].map(async (id) => {
        const blob = await loadPrivateMediaPreview(id);
        if (cancelled) URL.revokeObjectURL(blob); else blobs.push(blob);
        return [id, blob] as const;
      }));
      if (cancelled) return;
      const assets = Object.fromEntries(entries);
      const layout = resolveDesignLayout(document, JSON.parse(snapshotKey) as RenderSnapshot, undefined, assets, { mode: 'web' });
      setSvg(renderResolvedLayoutSvg(layout, { assets }));
    })().catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Aperçu indisponible.'); });
    return () => { cancelled = true; blobs.forEach((url) => URL.revokeObjectURL(url)); };
  }, [eventId, templateId, snapshotKey]);
  return <div><p className="inspector-note">Composition réelle · identité invité DEMO uniquement · les photos seront choisies après sélection.</p>{error ? <p role="alert">{error}</p> : svg ? <div style={{ width: '100%', maxWidth: 420, margin: 'auto' }} dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg style="width:100%;height:auto;display:block" ') }} /> : <p role="status">Chargement du modèle et des médias privés…</p>}</div>;
}
