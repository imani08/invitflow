'use client';
import { FONT_REGISTRY } from '@invitaflow/design-document';

export type EditableLayer = Record<string, unknown> & { id: string; name: string; type: string; locked: boolean; editable: boolean; x: number; y: number; width: number; height: number; rotation: number; zIndex: number };
export default function DesignLayerInspector({ layer, canvas, eventId, onChange, onReplace, onDuplicate, onDelete, onOrder }: {
  layer: EditableLayer | null; canvas: { width: number; height: number }; eventId: string;
  onChange: (change: (layer: EditableLayer) => void) => void;
  onReplace: () => void; onDuplicate: () => void; onDelete: () => void;
  onOrder: (position: 'front' | 'back' | 'up' | 'down') => void;
}) {
  if (!layer) return <p>Sélectionnez un élément sur l’aperçu ou dans les calques.</p>;
  const set = (key: string, value: unknown) => onChange(target => { target[key] = value; if (key === 'cropX' || key === 'cropY') delete target['focalPoint']; });
  const numeric = (key: string, label: string, min: number, max: number, step = 1) => <label>{label}<input type="number" step={step} min={min} max={max} value={Number(layer[key] ?? (key === 'opacity' ? 1 : 0))} onChange={e => { if (e.target.value !== '') set(key, Math.max(min, Math.min(max, Number(e.target.value)))); }} /></label>;
  const color = (key: string, label: string) => <label>{label}<input type="color" value={/^#[0-9a-f]{6}$/i.test(String(layer[key])) ? String(layer[key]) : '#32163a'} onChange={e => set(key, e.target.value)} /></label>;
  const bound = typeof layer['binding'] === 'string' || /\{\{/.test(String(layer['text'] ?? ''));
  return <div className="inspector-fields">
    <label>Nom du calque<input value={layer.name} maxLength={100} onChange={e => set('name', e.target.value)} /></label>
    <button type="button" onClick={() => onChange(target => { target.locked = !target.locked; target.editable = !target.locked; })}>{layer.locked ? 'Déverrouiller ce calque' : 'Verrouiller ce calque'}</button>
    {layer.locked ? <p>Calque verrouillé : déverrouillez-le pour le personnaliser.</p> : <>
      {layer.type === 'TEXT' && <>
        {bound ? <p className="inspector-note">Champ automatique : {String(layer['binding'] ?? layer['text'])}. Son apparence reste personnalisable. <a href={`/events/${eventId}`}>Modifier les informations de l’événement</a>. Les valeurs de l’aperçu sont des exemples.</p> : <label>Contenu du texte<textarea value={String(layer['text'] ?? '')} maxLength={500} onChange={e => set('text', e.target.value)} /></label>}
        <label>Police<select value={String(layer['fontId'] ?? 'georgia')} onChange={e => onChange(target => { target['fontId'] = e.target.value; target['fontFamily'] = FONT_REGISTRY[e.target.value]!.family; })}>{Object.entries(FONT_REGISTRY).map(([id, font]) => <option key={id} value={id}>{font.family}</option>)}</select></label>
        <label>Taille<input type="number" min={8} max={180} value={Number(layer['preferredFontSize'] ?? layer['fontSize'] ?? 36)} onChange={e => { if (e.target.value) onChange(target => { const size = Math.min(180, Math.max(8, Number(e.target.value))); target['fontSize'] = size; target['preferredFontSize'] = size; target['maxFontSize'] = size; target['minFontSize'] = Math.min(Number(target['minFontSize'] ?? 8), size); }); }} /></label>
        {color('color', 'Couleur du texte')}
        <label>Alignement<select value={String(layer['align'] ?? 'center')} onChange={e => set('align', e.target.value)}><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></label>
        {numeric('lineHeight', 'Interligne', .85, 2, .05)}{numeric('letterSpacing', 'Espacement des lettres', -10, 30, .5)}
      </>}
      {layer.type === 'IMAGE' && <>
        <button type="button" onClick={onReplace}>Remplacer l’image</button>
        <label>Ajustement<select value={String(layer['fit'] ?? 'cover')} onChange={e => set('fit', e.target.value)}><option value="cover">Remplir le cadre</option><option value="contain">Photo entière</option></select></label>
        {numeric('cropX', 'Recadrage horizontal (%)', 0, 100)}{numeric('cropY', 'Recadrage vertical (%)', 0, 100)}{numeric('cropScale', 'Zoom du recadrage', 1, 3, .05)}
      </>}
      {['BACKGROUND', 'SHAPE'].includes(layer.type) && <>{color('fill', 'Remplissage')}<button type="button" onClick={onReplace}>{layer.type === 'BACKGROUND' ? 'Ajouter ou remplacer une texture de fond' : 'Remplacer par une image'}</button>{layer.type === 'SHAPE' && !layer['ornamentId'] && <><button type="button" onClick={() => set('fill', 'transparent')}>Sans remplissage</button>{color('stroke', 'Contour')}{numeric('strokeWidth', 'Épaisseur du contour', 0, 30)}</>}</>}
      {layer.type === 'QR' ? <><p>Le contenu signé est géré par InvitaFlow. Gardez le QR visible, carré et suffisamment grand. Si aucun QR n’est placé, le rendu ajoute le QR fonctionnel.</p><label>Taille du QR<input type="number" min={Number(layer['minSize'] ?? 96)} max={Math.min(canvas.width - layer.x, canvas.height - layer.y, Number(layer['maxSize'] ?? 400))} value={layer.width} onChange={e => { if (e.target.value) onChange(target => { const size = Math.max(Number(target['minSize'] ?? 96), Math.min(Number(e.target.value), canvas.width - target.x, canvas.height - target.y, Number(target['maxSize'] ?? 400))); target.width = size; target.height = size; }); }} /></label></> : <>
        {layer.type !== 'BACKGROUND' && <>{numeric('width', 'Largeur', 1, canvas.width - layer.x)}{numeric('height', 'Hauteur', 1, canvas.height - layer.y)}</>}
        {layer.type === 'IMAGE' && <button type="button" onClick={() => onChange(target => { const ratio = Number(target['sourceWidth']) / Number(target['sourceHeight']); if (Number.isFinite(ratio) && ratio > 0) { target.height = Math.min(canvas.height - target.y, target.width / ratio); target.width = Math.min(canvas.width - target.x, target.height * ratio); } })}>Conserver les proportions de l’image</button>}
        {layer.type !== 'BACKGROUND' && numeric('rotation', 'Rotation (°)', -360, 360)}{numeric('opacity', 'Opacité', 0, 1, .05)}
        {layer.type === 'BACKGROUND' && <p>Le fond solide couvre le canevas. Ajoutez une texture indépendante pour la déplacer, la recadrer ou la faire pivoter.</p>}
      </>}
      {layer.type !== 'BACKGROUND' && <>{numeric('x', 'Position horizontale', 0, canvas.width - layer.width)}{numeric('y', 'Position verticale', 0, canvas.height - layer.height)}
        <div className="layer-tools">{(['back', 'down', 'up', 'front'] as const).map((position, i) => <button type="button" key={position} onClick={() => onOrder(position)}>{['Arrière-plan', 'Derrière', 'Devant', 'Premier plan'][i]}</button>)}</div>
        <button type="button" onClick={() => set('hidden', !layer['hidden'])}>{layer['hidden'] ? 'Réafficher' : 'Masquer'}</button>
        {layer.type !== 'QR' && <button type="button" onClick={onDuplicate}>Dupliquer</button>}
        <button type="button" className="danger-action" onClick={onDelete}>Supprimer ce calque</button>
      </>}
    </>}
  </div>;
}
