'use client';
import { createReferenceTemplate, renderResolvedLayoutSvg, resolveDesignLayout, type RenderSnapshot } from '@invitaflow/design-document';

export default function ReferenceTemplatePreview({ id, snapshot }: { id: string; snapshot: RenderSnapshot }) {
  const document = createReferenceTemplate(id);
  const layout = resolveDesignLayout(document, snapshot, undefined, {}, { mode: 'web' });
  return <div className="reference-template-preview"><div aria-label="Aperçu du modèle de référence avec les informations de l’événement" dangerouslySetInnerHTML={{ __html: renderResolvedLayoutSvg(layout).replace('<svg ', '<svg style="width:100%;height:auto;display:block" ') }} /><small>Photos personnelles à ajouter si souhaité · textes et programme dynamiques</small></div>;
}
