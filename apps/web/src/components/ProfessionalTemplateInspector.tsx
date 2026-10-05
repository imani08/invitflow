'use client';

type PhotoSlot = { id: string; elementId: string };
export default function ProfessionalTemplateInspector({ metadata, elements, uploading, onPhoto, onCrop, onColor, onFont, onReuse }: {
  metadata: Record<string, unknown>;
  elements: Array<{ id: string; type: string; color?: string; cropScale?: number; focalPoint?: { x: number; y: number } }>;
  uploading: boolean;
  onPhoto: (elementId: string) => void;
  onCrop: (elementId: string, change: { cropScale?: number; focalPoint?: { x: number; y: number } }) => void;
  onColor: (color: string) => void;
  onFont: (fontId: 'georgia' | 'arial') => void;
  onReuse: (slotId: string) => void;
}) {
  const slots = (metadata['photoSlots'] ?? []) as PhotoSlot[];
  const policy = metadata['personalization'] as { colors: string[] };
  return <aside className="editor-panel editor-right"><span className="design-kicker">PERSONNALISATION GUIDÉE</span><h2>{String(metadata['name'] ?? 'Invitation')}</h2>
    <p className="inspector-note">La composition et le programme sont protégés. Les noms, dates et cérémonies proviennent de votre événement et de chaque invité.</p>
    <div className="inspector-fields">{slots.map((slot) => {
      const photo = elements.find((element) => element.id === slot.elementId && element.type === 'IMAGE');
      return <fieldset key={slot.id}><legend>{slot.id === 'mainPhoto' ? 'Photo principale' : slot.id === 'backgroundPhoto' ? 'Photo de fond' : 'Photo secondaire'}</legend>
        <button disabled={uploading} onClick={() => onPhoto(slot.elementId)}>{uploading ? 'Téléversement…' : photo ? 'Remplacer la photo' : 'Choisir une photo'}</button>
        {slot.id !== 'mainPhoto' && <button disabled={!elements.some((element) => element.id === 'main-photo' && element.type === 'IMAGE')} onClick={() => onReuse(slot.id)}>Réutiliser la photo principale</button>}
        {photo && <><label>Zoom<input type="range" min="1" max="3" step="0.05" value={photo.cropScale ?? 1} onChange={(event) => onCrop(slot.elementId, { cropScale: Number(event.target.value) })} /></label>
          {(['x', 'y'] as const).map((axis) => <label key={axis}>Point focal {axis === 'x' ? 'horizontal' : 'vertical'}<input type="range" min="0" max="1" step="0.01" value={photo.focalPoint?.[axis] ?? 0.5} onChange={(event) => onCrop(slot.elementId, { focalPoint: { ...(photo.focalPoint ?? { x: 0.5, y: 0.5 }), [axis]: Number(event.target.value) } })} /></label>)}</>}
      </fieldset>;
    })}<fieldset><legend>Couleur du texte</legend>{policy.colors.map((color) => <button key={color} onClick={() => onColor(color)} aria-label={`Texte ${color}`} style={{ borderBottom: `6px solid ${color}` }}>{color}</button>)}</fieldset>
    <fieldset><legend>Typographie autorisée</legend><button onClick={() => onFont('georgia')}>Georgia</button><button onClick={() => onFont('arial')}>Arial</button></fieldset>
    <p className="inspector-note">Le changement de photo conserve le cadrage du template. Aucun crédit consommé avant la génération finale.</p></div>
  </aside>;
}
