import { renderResolvedLayoutSvg, resolveDesignLayout, type RenderSnapshot } from '@invitaflow/design-document';

/** Visual review only. Saving a decor still requires the authenticated Media validation flow. */
export default function AiProposalPreview({ document, snapshot, assets, previewUrl }: { document: unknown; snapshot: RenderSnapshot; assets: Record<string, string>; previewUrl: string | null }) {
  const layout = resolveDesignLayout(document, snapshot, undefined, assets, { mode: 'web' });
  const background = { ...layout, elements: layout.elements.filter(layer => layer['type'] === 'BACKGROUND') };
  const foreground = { ...layout, elements: layout.elements.filter(layer => layer['type'] !== 'BACKGROUND' && (!previewUrl || layer['id'] !== 'ai-background')) };
  return <div style={{ width: '100%', maxWidth: 380, margin: '16px auto' }}><svg viewBox={`0 0 ${layout.canvas.width} ${layout.canvas.height}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Proposition composée avec les textes de votre événement"><g dangerouslySetInnerHTML={{ __html: renderResolvedLayoutSvg(background, { assets, fragment: true }) }} />{previewUrl && <image href={previewUrl} x="0" y="0" width={layout.canvas.width} height={layout.canvas.height} opacity="0.24" preserveAspectRatio="xMidYMid slice" />}<g dangerouslySetInnerHTML={{ __html: renderResolvedLayoutSvg(foreground, { assets, fragment: true }) }} /></svg></div>;
}
