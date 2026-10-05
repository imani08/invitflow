'use client';

import AppNavbar from '@/components/AppNavbar';
import AIComposer from '@/components/AIComposer';
import EditorialAssist from '@/components/EditorialAssist';
import ProfessionalTemplateInspector from '@/components/ProfessionalTemplateInspector';
import ProfessionalTemplatePreview from '@/components/ProfessionalTemplatePreview';
import { loadPrivateMediaPreview } from '@/lib/private-media-preview.mjs';
import { assertProfessionalPersonalization, fillProfessionalPhotoSlot, compatibleProfessionalRecipes, PROFESSIONAL_RECIPES } from '@invitaflow/design-document';
import Image from 'next/image';
import Link from 'next/link';
import { resolveGuestPreviewValues } from '@/lib/design-guest-preview.mjs';
import { MASK_REGISTRY, IMAGE_ROLES, assessImageResolution, renderResolvedLayoutSvg, resolveDesignLayout, type ImageRole, type ImageOverlay } from '@invitaflow/design-document';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Layer = Record<string, unknown> & { role?: ImageRole; focalPoint?: { x: number; y: number }; maskId?: string; blur?: number; overlay?: ImageOverlay; id: string; name: string; type: 'BACKGROUND' | 'TEXT' | 'SHAPE' | 'IMAGE' | 'QR'; x: number; y: number; width: number; height: number; rotation: number; locked: boolean; editable: boolean; zIndex: number; fill?: string; stroke?: string; strokeWidth?: number; text?: string; source?: 'guest_access_token'; assetId?: string; originalAssetId?: string; derivedAssetId?: string; sourceWidth?: number; sourceHeight?: number; fit?: 'cover' | 'contain'; cropX?: number; cropY?: number; cropScale?: number; opacity?: number; fontFamily?: string; fontSize?: number; fontWeight?: number; align?: 'left' | 'center' | 'right'; color?: string };
type Document = { schemaVersion: 1 | 2; metadata: Record<string, unknown>; canvas: { width: number; height: number; unit: 'px' }; theme: { category: string; style: string; palette: string[]; tokens: { primary: string; secondary: string; background: string; font: string } }; assets: Record<string, unknown>[]; elements: Layer[]; variables: { key: string; label: string; type: 'TEXT'; defaultValue: string; required: boolean }[]; constraints: { safeMargin: number | { top: number; right: number; bottom: number; left: number }; allowOverflow: boolean }; layouts: { id: string; name: string; width: number; height: number }[]; ceremonyRules: Record<string, unknown>[]; exportProfiles: { id: string; width: number; height: number; unit: 'px' }[]; version: number };
type Event = { id: string; name: string; eventType?: string; status: string; timezone: string; startAt?: string | null; venue?: string | null; coupleNames?: string | null; invitationText?: string | null; ceremonies: { id: string; name: string; ceremonyType: string; date?: string | null; time?: string | null; venue?: string | null; address?: string | null; reference?: string | null; dressCode?: string | null }[] };
type PreviewGuest = { id: string; fullName: string; email: string | null; phone: string | null };
type Template = { id: string; slug: string; version: number; name: string; description: string; category: string; style: string; tags: string[]; ceremonyTypes: string[]; preview: { background: string; accent: string; style: string } };
type Design = { id: string; name: string; templateSlug: string | null; version: number; document: Document; createdAt: string; updatedAt: string };
type Version = { version: number; name: string; createdAt: string };
type Validation = { valid: boolean; checked: number; problems: { code: string; layerId?: string; message: string }[]; variables: { key: string; label: string; required: boolean }[] };
type AiJob = { id: string; baseVersion: number; prompt: string; summary: string | null; proposal: { document: Document; changes: Record<string, unknown>[] } | null; provider: 'mock' | 'self-hosted' | null; status: 'QUEUED' | 'PROCESSING' | 'PROPOSED' | 'FAILED' | 'CANCELLED'; attempt: number; errorCode: string | null; previewAvailable: boolean; createdAt: string; completedAt: string | null };

async function api<T>(eventId: string, path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/designs${path ? `/${path}` : ''}`, {
    method, cache: 'no-store', ...(data !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {}),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload ? (payload as { message: unknown }).message : undefined;
    throw new Error(typeof message === 'string' ? message : Array.isArray(message) ? message.join(' ') : response.status === 503 ? 'Le service Design est indisponible.' : 'La demande a échoué.');
  }
  return payload as T;
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function ImageInspector({ layer, canvas, uploading, backgroundStatus, backgroundDerivedAssetId, onRemoveBackground, onUseOriginal, onUseDerived, onRetryBackground, onReplace, onDelete, onChange }: {
  layer: Layer;
  canvas: Document['canvas'];
  uploading: boolean;
  backgroundStatus: 'NONE' | 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  backgroundDerivedAssetId?: string | undefined;
  onRemoveBackground: () => void;
  onUseOriginal: () => void;
  onUseDerived: () => void;
  onRetryBackground: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onChange: (change: (target: Layer) => void) => void;
}) {
  const printQuality = assessImageResolution(layer, canvas);
  return <div className="inspector-fields">
    <p className="inspector-note">Les originaux et dérivés PNG/WebP restent des médias privés.</p>
    <p className="inspector-note">Impression A5 : {printQuality.status}{printQuality.effectiveDpi === null ? ' · résolution inconnue' : ` · ${printQuality.effectiveDpi} DPI effectifs`}. La définition sera vérifiée sur le média stocké avant génération.</p>
    <label>Rôle visuel<select value={layer.role ?? 'PHOTO'} onChange={(change) => onChange((target) => { target.role = change.target.value as ImageRole; })}>{IMAGE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
    {(layer.role === 'BACKGROUND' || layer.role === 'TEXTURE') && <button type="button" onClick={() => onChange((target) => { target.x = 0; target.y = 0; target.width = canvas.width; target.height = canvas.height; })}>Couvrir tout le canevas</button>}
    <label>Masque<select value={layer.maskId ?? 'none'} onChange={(change) => onChange((target) => { target.maskId = change.target.value; })}>{Object.values(MASK_REGISTRY).map((mask) => <option key={mask.id} value={mask.id}>{mask.id} · v{mask.version}</option>)}</select></label>
    <label><input type="checkbox" checked={!!layer.focalPoint} onChange={(change) => onChange((target) => { if (change.target.checked) target.focalPoint = { x: 0.5, y: 0.5 }; else delete target.focalPoint; })} />Conserver un point focal</label>
    {layer.focalPoint && <><label>Point focal horizontal<input type="range" min="0" max="1" step="0.01" value={layer.focalPoint.x} onChange={(change) => onChange((target) => { target.focalPoint = { x: Number(change.target.value), y: target.focalPoint?.y ?? 0.5 }; })} /></label><label>Point focal vertical<input type="range" min="0" max="1" step="0.01" value={layer.focalPoint.y} onChange={(change) => onChange((target) => { target.focalPoint = { x: target.focalPoint?.x ?? 0.5, y: Number(change.target.value) }; })} /></label></>}
    <label>Flou léger<input type="range" min="0" max="24" step="1" value={layer.blur ?? 0} onChange={(change) => onChange((target) => { target.blur = Number(change.target.value); })} /></label>
    <label>Voile de lisibilité<select value={layer.overlay?.type ?? 'none'} onChange={(change) => onChange((target) => { if (change.target.value === 'none') delete target.overlay; else target.overlay = change.target.value === 'solid' ? { type: 'solid', color: '#000000', opacity: 0.3 } : { type: 'linear-gradient', angle: 90, opacity: 0.5, stops: [{ offset: 0, color: '#00000000' }, { offset: 1, color: '#000000' }] }; })}><option value="none">Sans voile</option><option value="solid">Couleur unie</option><option value="linear-gradient">Dégradé</option></select></label>
    {layer.overlay && <><label>Opacité du voile<input type="range" min="0" max="1" step="0.05" value={layer.overlay.opacity} onChange={(change) => onChange((target) => { if (target.overlay) target.overlay = { ...target.overlay, opacity: Number(change.target.value) }; })} /></label>{layer.overlay.type === 'solid' ? <label>Couleur du voile<input type="color" value={layer.overlay.color} onChange={(change) => onChange((target) => { if (target.overlay?.type === 'solid') target.overlay = { ...target.overlay, color: change.target.value }; })} /></label> : <><label>Angle du dégradé<input type="range" min="0" max="360" value={layer.overlay.angle} onChange={(change) => onChange((target) => { if (target.overlay?.type === 'linear-gradient') target.overlay = { ...target.overlay, angle: Number(change.target.value) }; })} /></label>{layer.overlay.stops.map((stop, index) => <label key={index}>Couleur {index + 1}<input type="color" value={stop.color.slice(0, 7)} onChange={(change) => onChange((target) => { if (target.overlay?.type === 'linear-gradient') target.overlay = { ...target.overlay, stops: target.overlay.stops.map((entry, current) => current === index ? { ...entry, color: change.target.value } : entry) }; })} /></label>)}</>}</>}
    <button className="ai-apply-action" disabled={uploading} onClick={onReplace}>{uploading ? 'Téléversement…' : 'Remplacer la photo'}</button>
    <div className="background-removal-tools"><button disabled={uploading || backgroundStatus === 'PENDING' || backgroundStatus === 'PROCESSING' || backgroundStatus === 'READY'} onClick={backgroundStatus === 'FAILED' ? onRetryBackground : onRemoveBackground}>{backgroundStatus === 'PENDING' || backgroundStatus === 'PROCESSING' ? 'Suppression de l’arrière-plan en cours…' : backgroundStatus === 'FAILED' ? 'Réessayer' : 'Supprimer l’arrière-plan'}</button><div><button disabled={!layer.originalAssetId || layer.assetId === layer.originalAssetId} onClick={onUseOriginal}>Utiliser l’original</button><button disabled={backgroundStatus !== 'READY' || !backgroundDerivedAssetId || layer.assetId === backgroundDerivedAssetId} onClick={onUseDerived}>Sans arrière-plan</button></div>{backgroundStatus === 'FAILED' && <p role="status">La suppression de l’arrière-plan a échoué. Votre photo originale est toujours disponible.</p>}</div>
    <div className="inspector-pair">
      <label>Largeur<input type="number" min="1" max={canvas.width - layer.x} value={Math.round(layer.width)} onChange={(eventChange) => onChange((target) => { target.width = Number(eventChange.target.value); })} /></label>
      <label>Hauteur<input type="number" min="1" max={canvas.height - layer.y} value={Math.round(layer.height)} onChange={(eventChange) => onChange((target) => { target.height = Number(eventChange.target.value); })} /></label>
    </div>
    <label>Recadrage<select value={layer.fit ?? 'cover'} onChange={(eventChange) => onChange((target) => { target.fit = eventChange.target.value as 'cover' | 'contain'; })}><option value="cover">Remplir le cadre</option><option value="contain">Afficher toute la photo</option></select></label>
    <label>Zoom · {Number(layer.cropScale ?? 1).toFixed(1)}×<input type="range" min="1" max="3" step="0.05" value={layer.cropScale ?? 1} onChange={(eventChange) => onChange((target) => { target.cropScale = Number(eventChange.target.value); })} /></label>
    <label>Recadrage horizontal<input type="range" min="0" max="100" value={layer.cropX ?? 50} onChange={(eventChange) => onChange((target) => { target.cropX = Number(eventChange.target.value); })} /></label>
    <label>Recadrage vertical<input type="range" min="0" max="100" value={layer.cropY ?? 50} onChange={(eventChange) => onChange((target) => { target.cropY = Number(eventChange.target.value); })} /></label>
    <label>Opacité<input type="range" min="0" max="1" step="0.05" value={layer.opacity ?? 1} onChange={(eventChange) => onChange((target) => { target.opacity = Number(eventChange.target.value); })} /></label>
    <div className="inspector-pair">
      <label>Rotation<input type="number" min="-360" max="360" value={layer.rotation} onChange={(eventChange) => onChange((target) => { target.rotation = Number(eventChange.target.value); })} /></label>
      <label>Position X<input type="number" min="0" max={canvas.width - layer.width} value={Math.round(layer.x)} onChange={(eventChange) => onChange((target) => { target.x = Number(eventChange.target.value); })} /></label>
    </div>
    <label className="position-fields">Position Y<input type="number" min="0" max={canvas.height - layer.height} value={Math.round(layer.y)} onChange={(eventChange) => onChange((target) => { target.y = Number(eventChange.target.value); })} /></label>
    <button className="danger-action" onClick={onDelete}>Supprimer cette photo</button>
  </div>;
}

export function DesignsWorkspace({ event }: { event: Event }) {
  const [mediaInventory, setMediaInventory] = useState<{ hasPhotos: boolean; photoCount: number; photoOrientation: string } | null>(null);
  const [mediaError, setMediaError] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [selected, setSelected] = useState<Design | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('ALL');
  const [ceremonyType, setCeremonyType] = useState('ALL');
  const [templateSearch, setTemplateSearch] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [mobileEditorPanel, setMobileEditorPanel] = useState<'canvas' | 'layers' | 'settings'>('canvas');
  const [versions, setVersions] = useState<Version[]>([]);
  const [savedDocument, setSavedDocument] = useState<Document | null>(null);
  const [savedName, setSavedName] = useState('');
  const [validation, setValidation] = useState<Validation | null>(null);
  const [zoom, setZoom] = useState(0.36);
  const [dragMode, setDragMode] = useState(false);
  const [history, setHistory] = useState<Document[]>([]);
  const [future, setFuture] = useState<Document[]>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiJob, setAiJob] = useState<AiJob | null>(null);
  const aiJobId = aiJob?.id;
  const aiJobStatus = aiJob?.status;
  const selectedId = selected?.id;
  const [aiBusy, setAiBusy] = useState(false);
  const [previewGuests, setPreviewGuests] = useState<PreviewGuest[]>([]);
  const [previewGuest, setPreviewGuest] = useState<PreviewGuest | null>(null);
  const previewGuestId = previewGuest?.id;
  const [previewCeremonyId, setPreviewCeremonyId] = useState(event.ceremonies[0]?.id ?? '');
  const [previewTableName, setPreviewTableName] = useState('');
  const [previewGuestSearch, setPreviewGuestSearch] = useState('');
  const [previewGuestError, setPreviewGuestError] = useState('');
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [backgroundJobs, setBackgroundJobs] = useState<Record<string, { status: 'NONE' | 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED'; derivedAssetId?: string }>>({});
  const [imageUploading, setImageUploading] = useState(false);
  const [showSafeMargins, setShowSafeMargins] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageReplaceLayerId = useRef<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ id: number; layerId: string; x: number; y: number; moved: boolean; start: Document } | null>(null);
  const openLayer = selected?.document.elements.find((layer) => layer.id === activeLayerId) ?? null;
  const selectedImageIds = selected?.document.elements.filter((layer) => layer.type === 'IMAGE' && typeof layer.assetId === 'string').map((layer) => layer.assetId!).join(',') ?? '';
  const sourceImageIds = selected?.document.elements.filter((layer) => layer.type === 'IMAGE').map((layer) => layer.originalAssetId ?? layer.assetId).filter((assetId): assetId is string => typeof assetId === 'string').join(',') ?? '';
  const dirty = !!selected && !!savedDocument && (selected.name !== savedName || JSON.stringify(selected.document) !== JSON.stringify(savedDocument));
  const eventCeremonyTypes = useMemo(() => [...new Set(event.ceremonies.map((ceremony) => ceremony.ceremonyType.toUpperCase() === 'OTHER' ? 'CUSTOM' : ceremony.ceremonyType.toUpperCase()))], [event.ceremonies]);
  const filteredTemplates = useMemo(() => {
    const query = templateSearch.trim().toLocaleLowerCase('fr');
    const compatible = new Set(compatibleProfessionalRecipes(mediaInventory ?? {}).map(recipe => recipe.id));
    return templates.filter((template) => (!PROFESSIONAL_RECIPES.some(recipe => recipe.id === template.slug) || compatible.has(template.slug)) && (category === 'ALL' || template.category === category)
      && (ceremonyType === 'ALL' || template.ceremonyTypes.includes('UNIVERSAL') || template.ceremonyTypes.includes(ceremonyType))
      && (!query || [template.name, template.description, template.category, template.style, ...template.tags].join(' ').toLocaleLowerCase('fr').includes(query)));
  }, [templates, category, ceremonyType, templateSearch, mediaInventory]);

  const refresh = useCallback(async () => {
    setLoading(true); setMessage(''); setCatalogError('');
    try {
      const [templateResponse, designResponse] = await Promise.all([
        api<{ items: Template[] }>(event.id, 'templates'), api<{ items: Design[] }>(event.id, ''),
      ]);
      setTemplates(templateResponse.items); setDesigns(designResponse.items);
    } catch (error) { setCatalogError(error instanceof Error ? error.message : 'Chargement impossible.'); }
    finally { setLoading(false); }
  }, [event.id]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        let cursor: string | null = null;
        let count = 0; const orientations = new Set<string>(); const seen = new Set<string>();
        do {
          const response = await fetch('/api/assets?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), { cache: 'no-store', signal: controller.signal });
          if (!response.ok) throw new Error('Inventaire des photos indisponible. Les compositions sans photo restent accessibles.');
          const page = await response.json() as { items: { purpose: string; status: string; width?: number; height?: number }[]; nextCursor: string | null };
          for (const asset of page.items) if (asset.purpose === 'PHOTO' && asset.status === 'READY') { count++; if (asset.width && asset.height) orientations.add(asset.width === asset.height ? 'SQUARE' : asset.width > asset.height ? 'LANDSCAPE' : 'PORTRAIT'); }
          cursor = page.nextCursor;
          if (cursor && seen.has(cursor)) throw new Error('Inventaire incomplet. Réessayez plus tard.');
          if (cursor) seen.add(cursor);
        } while (cursor);
        if (!controller.signal.aborted) { setMediaInventory({ hasPhotos: count > 0, photoCount: count, photoOrientation: orientations.size === 1 ? [...orientations][0]! : orientations.size ? 'MIXED' : 'UNKNOWN' }); setMediaError(''); }
      } catch (error) { if (!controller.signal.aborted) setMediaError(error instanceof Error ? error.message : 'Inventaire indisponible.'); }
    })();
    return () => controller.abort();
  }, [imageUploading]);

  useEffect(() => {
    let cancelled = false;
    const blobs: string[] = [];
    const assetIds = selectedImageIds ? [...new Set(selectedImageIds.split(','))] : [];
    if (!assetIds.length) { setImageUrls({}); return; }
    void Promise.all(assetIds.map(async (assetId) => {
      try {
        const url = await loadPrivateMediaPreview(assetId);
        if (cancelled) { URL.revokeObjectURL(url); return [assetId, ''] as const; }
        blobs.push(url);
        return [assetId, url] as const;
      } catch { return [assetId, ''] as const; }
    })).then((entries) => {
      if (!cancelled) setImageUrls(Object.fromEntries(entries));
    });
    return () => { cancelled = true; blobs.forEach((url) => URL.revokeObjectURL(url)); };
  }, [selected?.id, selectedImageIds]);

  useEffect(() => {
    let cancelled = false;
    const ids = sourceImageIds ? [...new Set(sourceImageIds.split(','))] : [];
    const poll = async () => {
      const entries = await Promise.all(ids.map(async (assetId) => {
        try {
          const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/background-removal`, { cache: 'no-store' });
          const result = await response.json() as { status?: 'NONE' | 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED'; derivedAssetId?: string };
          return [assetId, { status: response.ok ? result.status ?? 'NONE' : 'FAILED', ...(result.derivedAssetId ? { derivedAssetId: result.derivedAssetId } : {}) }] as const;
        } catch { return [assetId, { status: 'NONE' as const }] as const; }
      }));
      if (!cancelled) setBackgroundJobs((jobs) => ({ ...jobs, ...Object.fromEntries(entries) }));
    };
    void poll();
    const timer = ids.length ? setInterval(() => void poll(), 2500) : undefined;
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [event.id, sourceImageIds]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ limit: '50' });
      if (previewGuestSearch.trim()) query.set('q', previewGuestSearch.trim());
      void fetch(`/api/events/${encodeURIComponent(event.id)}/guests?${query}`, { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          const payload: unknown = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' ? payload.message : 'Recherche des invités indisponible.');
          const items = payload && typeof payload === 'object' && 'items' in payload && Array.isArray(payload.items) ? payload.items : [];
          setPreviewGuests(items.filter((item): item is PreviewGuest => !!item && typeof item === 'object' && 'id' in item && typeof item.id === 'string' && 'fullName' in item && typeof item.fullName === 'string').map((item) => ({ id: item.id, fullName: item.fullName, email: 'email' in item && typeof item.email === 'string' ? item.email : null, phone: 'phone' in item && typeof item.phone === 'string' ? item.phone : null })));
          setPreviewGuestError('');
        })
        .catch((error: unknown) => { if (!controller.signal.aborted) setPreviewGuestError(error instanceof Error ? error.message : 'Recherche des invités indisponible.'); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [event.id, previewGuestSearch, selectedId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedId || !previewGuestId) { setPreviewTableName(''); return; }
    const loadTableNames = async () => {
      const names = await Promise.all(event.ceremonies.map(async (ceremony) => {
        const root = `/api/events/${encodeURIComponent(event.id)}/ceremonies/${encodeURIComponent(ceremony.id)}/seating`;
        try {
          const planResponse = await fetch(root, { cache: 'no-store' });
          if (!planResponse.ok) return '';
          const plan = await planResponse.json() as { mode?: string };
          if (plan.mode !== 'TABLE') return '';
          const [assignmentsResponse, tablesResponse] = await Promise.all([
            fetch(`${root}/assignments`, { cache: 'no-store' }),
            fetch(`${root}/tables`, { cache: 'no-store' }),
          ]);
          if (!assignmentsResponse.ok || !tablesResponse.ok) return '';
          const assignments = await assignmentsResponse.json() as { guestId?: string; tableId?: string | null }[];
          const tables = await tablesResponse.json() as { id?: string; name?: string }[];
          const tableId = assignments.find((assignment) => assignment.guestId === previewGuestId)?.tableId;
          return tables.find((table) => table.id === tableId)?.name ?? '';
        } catch { return ''; }
      }));
      if (!cancelled) setPreviewTableName([...new Set(names.filter(Boolean))].join(' · '));
    };
    void loadTableNames();
    return () => { cancelled = true; };
  }, [event.ceremonies, event.id, previewGuestId, selectedId]);

  useEffect(() => {
    if (!aiJobId || !selectedId || aiJobStatus === 'PROPOSED' || aiJobStatus === 'FAILED' || aiJobStatus === 'CANCELLED') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const latest = await api<AiJob>(event.id, `${encodeURIComponent(selectedId)}/ai-jobs/${encodeURIComponent(aiJobId)}`);
        if (cancelled) return;
        setAiJob(latest);
        if (latest.status === 'QUEUED' || latest.status === 'PROCESSING') timer = setTimeout(() => void poll(), 1800);
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : 'Impossible de suivre la demande IA.');
        timer = setTimeout(() => void poll(), 4000);
      }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [event.id, selectedId, aiJobId, aiJobStatus]);

  useEffect(() => {
    function onKeyDown(eventKey: KeyboardEvent) {
      const target = eventKey.target;
      const editable = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (editable || !selected) return;
      const key = eventKey.key.toLowerCase();
      if ((eventKey.ctrlKey || eventKey.metaKey) && key === 'z') {
        eventKey.preventDefault();
        if (eventKey.shiftKey) redo(); else undo();
      } else if ((eventKey.ctrlKey || eventKey.metaKey) && key === 'y') {
        eventKey.preventDefault(); redo();
      } else if ((eventKey.ctrlKey || eventKey.metaKey) && key === 's') {
        eventKey.preventDefault(); void save();
      } else if (eventKey.key === 'Delete' && openLayer && openLayer.editable && !openLayer.locked && openLayer.type !== 'BACKGROUND') {
        eventKey.preventDefault();
        editDocument((document) => { document.elements = document.elements.filter((layer) => layer.id !== openLayer.id); });
        setActiveLayerId(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const selectDesign = useCallback(async (design: Design) => {
    setBusy(true); setMessage('');
    try {
      const [full, versionResponse] = await Promise.all([
        api<Design>(event.id, encodeURIComponent(design.id)),
        api<{ items: Version[] }>(event.id, `${encodeURIComponent(design.id)}/versions`),
      ]);
      setSelected(full); setSavedDocument(clone(full.document)); setSavedName(full.name); setVersions(versionResponse.items); setValidation(null);
      setAiJob(null); setAiPrompt('');
      setActiveLayerId(full.document.elements.find((layer) => layer.type === 'TEXT' && layer.editable && !layer.locked)?.id ?? null);
      setHistory([]); setFuture([]); setMobileEditorPanel('canvas');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ouverture impossible.'); }
    finally { setBusy(false); }
  }, [event.id]);

  function editDocument(edit: (document: Document) => void) {
    if (!selected) return;
    const previous = clone(selected.document);
    const document = clone(selected.document);
    edit(document);
    try { assertProfessionalPersonalization(previous, document); }
    catch { setMessage('La grille est protégée. Utilisez la personnalisation guidée pour modifier les photos et les couleurs.'); return; }
    setHistory((items) => [...items.slice(-49), previous]); setFuture([]);
    setSelected({ ...selected, document }); setValidation(null);
  }

  function undo() {
    if (!selected || !history.length) return;
    const document = history[history.length - 1]!;
    setHistory((items) => items.slice(0, -1)); setFuture((items) => [clone(selected.document), ...items].slice(0, 50));
    setSelected({ ...selected, document }); setValidation(null);
  }

  function redo() {
    if (!selected || !future.length) return;
    const document = future[0]!;
    setFuture((items) => items.slice(1)); setHistory((items) => [...items.slice(-49), clone(selected.document)]);
    setSelected({ ...selected, document }); setValidation(null);
  }

  async function createFromTemplate(template: Template) {
    setBusy(true); setMessage('');
    try {
      const created = await api<Design>(event.id, '', 'POST', { templateId: template.id, name: `${template.name} · ${event.name}` });
      setPreviewTemplate(null);
      await refresh();
      await selectDesign(created);
      setMessage(`« ${template.name} » est prêt à personnaliser. Enregistrez vos changements quand vous le souhaitez.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Création impossible.'); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!selected || !dirty) return;
    setBusy(true); setMessage('');
    try {
      const result = await api<Design>(event.id, encodeURIComponent(selected.id), 'PUT', { name: selected.name, document: selected.document, expectedVersion: selected.version });
      setSelected(result); setSavedDocument(clone(result.document)); setSavedName(result.name); setDesigns((items) => [result, ...items.filter((item) => item.id !== result.id)]);
      setVersions((items) => [{ version: result.version, name: result.name, createdAt: result.updatedAt }, ...items.filter((item) => item.version !== result.version)]);
      setHistory([]); setFuture([]); setMessage('Design enregistré, version ' + result.version + '.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  }

  async function inspect() {
    if (!selected) return;
    setBusy(true); setMessage('');
    try { setValidation(await api<Validation>(event.id, `${encodeURIComponent(selected.id)}/validate`, 'POST', {})); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Validation impossible.'); }
    finally { setBusy(false); }
  }

  async function requestAiProposal() {
    if (!selected || dirty || aiBusy || aiPrompt.trim().length < 8) return;
    setAiBusy(true); setMessage(''); setAiJob(null);
    try {
      const job = await api<AiJob>(event.id, `${encodeURIComponent(selected.id)}/ai-jobs`, 'POST', { prompt: aiPrompt.trim() });
      setAiJob(job); setMessage('Demande ajoutée à la file de création.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Impossible de demander une proposition.'); }
    finally { setAiBusy(false); }
  }

  function applyAiProposal() {
    if (!selected || !aiJob?.proposal || dirty || selected.version !== aiJob.baseVersion) return;
    const previous = clone(selected.document);
    const document = clone(aiJob.proposal.document); document.version = selected.version;
    setHistory((items) => [...items.slice(-49), previous]); setFuture([]);
    setSelected({ ...selected, document }); setValidation(null); setMessage('Proposition appliquée. Relisez-la puis enregistrez le design.');
  }

  async function retryAiJob() {
    if (!selected || !aiJob || aiBusy) return;
    setAiBusy(true); setMessage('');
    try {
      const job = await api<AiJob>(event.id, `${encodeURIComponent(selected.id)}/ai-jobs/${encodeURIComponent(aiJob.id)}/retry`, 'POST', {});
      setAiJob(job); setMessage('La demande a été remise en file.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Impossible de relancer la demande.'); }
    finally { setAiBusy(false); }
  }

  async function restoreVersion(version: number) {
    if (!selected || !window.confirm(`Restaurer la version ${version} ? Une nouvelle version sera créée.`)) return;
    setBusy(true); setMessage('');
    try {
      const restored = await api<Design>(event.id, `${encodeURIComponent(selected.id)}/restore`, 'POST', { version });
      await selectDesign(restored); await refresh(); setMessage(`Version ${version} restaurée dans une nouvelle version ${restored.version}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Restauration impossible.'); }
    finally { setBusy(false); }
  }

  async function archive() {
    if (!selected || !window.confirm(`Archiver « ${selected.name} » ?`)) return;
    setBusy(true); setMessage('');
    try { await api(event.id, encodeURIComponent(selected.id), 'DELETE'); setSelected(null); setSavedDocument(null); setSavedName(''); await refresh(); setMessage('Design archivé.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Archivage impossible.'); }
    finally { setBusy(false); }
  }

  function addText() {
    if (!selected) return;
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    const layer: Layer = { id, type: 'TEXT', name: 'Nouveau texte', x: 130, y: 1310, width: selected.document.canvas.width - 260, height: 120, rotation: 0, locked: false, editable: true, zIndex: Math.max(...selected.document.elements.map((entry) => entry.zIndex), 0) + 1, text: 'Votre texte', fontFamily: selected.document.theme.tokens.font, fontSize: 36, fontWeight: 400, align: 'center', color: selected.document.theme.tokens.secondary };
    editDocument((document) => { document.elements.push(layer); }); setActiveLayerId(id);
  }

  function addShape() {
    if (!selected) return;
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    const layer: Layer = { id, type: 'SHAPE', name: 'Nouveau cadre', x: 150, y: 1290, width: selected.document.canvas.width - 300, height: 180, rotation: 0, locked: false, editable: true, zIndex: Math.max(...selected.document.elements.map((entry) => entry.zIndex), 0) + 1, shape: 'RECTANGLE', fill: 'transparent', stroke: selected.document.theme.tokens.primary, strokeWidth: 2 };
    editDocument((document) => { document.elements.push(layer); }); setActiveLayerId(id);
  }

  function addQr() {
    if (!selected || selected.document.elements.some((layer) => layer.type === 'QR')) return;
    const size = Math.min(156, selected.document.canvas.width - 96, selected.document.canvas.height - 96);
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    const layer: Layer = { id, type: 'QR', source: 'guest_access_token', name: 'QR individuel', x: selected.document.canvas.width - size - 48, y: selected.document.canvas.height - size - 48, width: size, height: size, rotation: 0, locked: false, editable: true, zIndex: Math.max(...selected.document.elements.map((entry) => entry.zIndex), 0) + 1 };
    editDocument((document) => { document.elements.push(layer); }); setActiveLayerId(id);
  }

  async function uploadCouplePhoto(eventChange: React.ChangeEvent<HTMLInputElement>) {
    const file = eventChange.target.files?.[0];
    eventChange.target.value = '';
    if (!file || !selected) return;
    const replaceId = imageReplaceLayerId.current ?? (selected.document.metadata?.['personalization'] && selected.document.metadata['mediaStrategy'] !== 'NO_PHOTO' ? 'main-photo' : null);
    if (selected.document.metadata['mediaStrategy'] === 'NO_PHOTO') { setMessage('Cette composition ne comporte aucun emplacement photo.'); return; }
    imageReplaceLayerId.current = null;
    if (!replaceId && selected.document.elements.length >= 100) { setMessage('Ce design a déjà atteint sa limite de 100 calques.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
      setMessage('Choisissez une image JPG, PNG ou WebP de 5 Mio maximum.');
      return;
    }
    setImageUploading(true); setMessage('Téléversement et validation de la photo…');
    let assetId = '';
    try {
      const createdResponse = await fetch('/api/assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size, purpose: 'PHOTO' }), cache: 'no-store' });
      const created = await createdResponse.json() as { id?: string; message?: string };
      if (!createdResponse.ok || typeof created.id !== 'string') throw new Error(created.message ?? 'Impossible de réserver le téléversement.');
      assetId = created.id;
      const uploadResponse = await fetch(`/api/assets/${encodeURIComponent(assetId)}/upload-url`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' });
      const uploadPayload = await uploadResponse.json() as { upload?: { url?: string; method?: string; fields?: Record<string, string> }; message?: string };
      if (!uploadResponse.ok || typeof uploadPayload.upload?.url !== 'string' || uploadPayload.upload.method !== 'POST' || !uploadPayload.upload.fields) throw new Error(uploadPayload.message ?? 'Impossible de préparer le téléversement.');
      const form = new FormData();
      for (const [key, value] of Object.entries(uploadPayload.upload.fields)) form.append(key, value);
      form.append('file', file, file.name);
      const uploaded = await fetch(uploadPayload.upload.url, { method: 'POST', body: form });
      if (!uploaded.ok) throw new Error('Le stockage a refusé la photo. Réessayez.');
      const completeResponse = await fetch(`/api/assets/${encodeURIComponent(assetId)}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' });
      const asset = await completeResponse.json() as { id?: string; status?: string; width?: number; height?: number; message?: string };
      if (!completeResponse.ok || asset.status !== 'READY' || !Number.isInteger(asset.width) || !Number.isInteger(asset.height)) throw new Error(asset.message ?? 'La photo n’a pas passé la validation.');
      const layer = selected.document.elements.find((item) => item.id === replaceId && item.type === 'IMAGE');
      const sourceWidth = asset.width!; const sourceHeight = asset.height!;
      if ((selected.document.metadata['personalization'] as { policy?: string } | undefined)?.policy === 'professional-v1') {
        const slots = selected.document.metadata['photoSlots'] as { id: string; elementId: string }[];
        const slot = slots.find((item) => item.elementId === replaceId);
        if (!slot) throw new Error('Sélectionnez un emplacement photo dans la personnalisation guidée.');
        editDocument((document) => { Object.assign(document, fillProfessionalPhotoSlot(document, slot.id, { assetId, width: sourceWidth, height: sourceHeight })); });
      } else if (layer) {
        editDocument((document) => {
          const target = document.elements.find((item) => item.id === replaceId)!;
          Object.assign(target, { assetId, originalAssetId: assetId, sourceWidth, sourceHeight, cropX: 50, cropY: 50, cropScale: 1 });
          delete target.derivedAssetId;
          document.assets = [...document.assets.filter((item) => item['assetId'] !== assetId), { id: assetId, assetId, role: 'COUPLE_PHOTO', width: sourceWidth, height: sourceHeight, mimeType: 'image/webp' }];
        });
      } else {
        const factor = Math.min(selected.document.canvas.width * 0.7 / sourceWidth, selected.document.canvas.height * 0.55 / sourceHeight, 1);
        const width = Math.max(1, Math.round(sourceWidth * factor)); const height = Math.max(1, Math.round(sourceHeight * factor));
        const id = `photo-${crypto.randomUUID().slice(0, 8)}`;
        const image: Layer = { id, type: 'IMAGE', assetId, originalAssetId: assetId, sourceWidth, sourceHeight, name: 'Photo des mariés', x: Math.round((selected.document.canvas.width - width) / 2), y: Math.round(selected.document.canvas.height * 0.12), width, height, rotation: 0, locked: false, editable: true, zIndex: Math.max(...selected.document.elements.map((item) => item.zIndex), 0) + 1, fit: 'cover', cropX: 50, cropY: 50, cropScale: 1, opacity: 1 };
        editDocument((document) => {
          document.elements.push(image);
          document.assets = [...document.assets.filter((item) => item['assetId'] !== assetId), { id: assetId, assetId, role: 'COUPLE_PHOTO', width: sourceWidth, height: sourceHeight, mimeType: 'image/webp' }];
        });
        setActiveLayerId(id);
      }
      setMessage('Photo validée et ajoutée au design.');
    } catch (error) {
      if (assetId) await fetch(`/api/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' }).catch(() => undefined);
      setMessage(error instanceof Error ? error.message : 'Le téléversement de la photo a échoué.');
    } finally { setImageUploading(false); }
  }

  async function startBackgroundRemoval(sourceAssetId: string) {
    setBackgroundJobs((jobs) => ({ ...jobs, [sourceAssetId]: { status: 'PENDING' } }));
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(sourceAssetId)}/background-removal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' });
      const result = await response.json() as { jobId?: string; status?: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED'; derivedAssetId?: string; message?: string };
      if (!response.ok || !result.jobId) throw new Error(result.message ?? 'Impossible de démarrer le traitement.');
      setBackgroundJobs((jobs) => ({ ...jobs, [sourceAssetId]: { status: result.status ?? 'PENDING', ...(result.derivedAssetId ? { derivedAssetId: result.derivedAssetId } : {}) } }));
    } catch {
      setBackgroundJobs((jobs) => ({ ...jobs, [sourceAssetId]: { status: 'FAILED' } }));
    }
  }

  function choosePhotoVersion(layer: Layer, assetId: string, derivedAssetId?: string) {
    editDocument((document) => {
      const target = document.elements.find((item) => item.id === layer.id);
      if (!target) return;
      if (!target.originalAssetId && target.assetId) target.originalAssetId = target.assetId;
      target.assetId = assetId;
      if (derivedAssetId) target.derivedAssetId = derivedAssetId;
    });
  }

  function duplicateLayer(layer: Layer) {
    if (!selected || layer.locked || !layer.editable || layer.type === 'BACKGROUND') return;
    const copy = clone(layer); copy.id = `custom-${crypto.randomUUID().slice(0, 8)}`; copy.name = `${layer.name} · copie`;
    copy.x = Math.min(selected.document.canvas.width - copy.width, copy.x + 24); copy.y = Math.min(selected.document.canvas.height - copy.height, copy.y + 24);
    copy.zIndex = Math.max(...selected.document.elements.map((entry) => entry.zIndex), 0) + 1;
    editDocument((document) => { document.elements.push(copy); }); setActiveLayerId(copy.id);
  }

  function moveLayerInStack(layer: Layer, direction: -1 | 1) {
    if (!selected || layer.type === 'BACKGROUND' || layer.locked || !layer.editable) return;
    const ordered = [...selected.document.elements].sort((a, b) => a.zIndex - b.zIndex);
    const index = ordered.findIndex((entry) => entry.id === layer.id);
    const neighbor = ordered[index + direction];
    if (!neighbor || neighbor.type === 'BACKGROUND' || neighbor.locked) return;
    editDocument((document) => {
      const first = document.elements.find((entry) => entry.id === layer.id)!;
      const second = document.elements.find((entry) => entry.id === neighbor.id)!;
      const position = first.zIndex; first.zIndex = second.zIndex; second.zIndex = position;
    });
  }

  function toggleLayerLock(layer: Layer) {
    if (!selected || layer.type === 'BACKGROUND') return;
    editDocument((document) => {
      const target = document.elements.find((entry) => entry.id === layer.id)!;
      target.locked = !target.locked; target.editable = !target.locked;
    });
  }

  function beginDrag(eventPointer: React.PointerEvent<SVGElement>, layer: Layer) {
    if (!dragMode || !selected || layer.locked || !layer.editable || layer.type === 'BACKGROUND') return;
    eventPointer.preventDefault(); eventPointer.currentTarget.setPointerCapture(eventPointer.pointerId);
    const rect = stageRef.current?.getBoundingClientRect(); if (!rect) return;
    pointerRef.current = { id: eventPointer.pointerId, layerId: layer.id, x: eventPointer.clientX, y: eventPointer.clientY, moved: false, start: clone(selected.document) };
    setActiveLayerId(layer.id);
  }

  function moveDrag(eventPointer: React.PointerEvent<SVGSVGElement>) {
    const active = pointerRef.current; if (!active || !selected || active.id !== eventPointer.pointerId || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const dx = (eventPointer.clientX - active.x) / rect.width * selected.document.canvas.width;
    const dy = (eventPointer.clientY - active.y) / rect.height * selected.document.canvas.height;
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return;
    active.moved = true; active.x = eventPointer.clientX; active.y = eventPointer.clientY;
    const document = clone(selected.document); const layer = document.elements.find((item) => item.id === active.layerId);
    if (!layer || layer.locked || !layer.editable) return;
    const grid = 12;
    const nextX = Math.max(0, Math.min(document.canvas.width - layer.width, layer.x + dx));
    const nextY = Math.max(0, Math.min(document.canvas.height - layer.height, layer.y + dy));
    const snapX = Math.round(nextX / grid) * grid;
    const snapY = Math.round(nextY / grid) * grid;
    const centerX = Math.round((nextX + layer.width / 2) / grid) * grid - layer.width / 2;
    const centerY = Math.round((nextY + layer.height / 2) / grid) * grid - layer.height / 2;
    layer.x = Math.max(0, Math.min(document.canvas.width - layer.width, Math.abs(centerX - nextX) < 8 ? centerX : snapX));
    layer.y = Math.max(0, Math.min(document.canvas.height - layer.height, Math.abs(centerY - nextY) < 8 ? centerY : snapY));
    setSelected({ ...selected, document }); setValidation(null);
  }

  function endDrag(eventPointer: React.PointerEvent<SVGSVGElement>) {
    const active = pointerRef.current; if (!active || active.id !== eventPointer.pointerId || !selected) return;
    if (active.moved) { setHistory((items) => [...items.slice(-49), active.start]); setFuture([]); }
    pointerRef.current = null;
  }

  const variableMap = selected ? resolveGuestPreviewValues(selected.document.variables, previewGuest, { tableName: previewTableName }) : {};
  const resolvedPreview = selected ? resolveDesignLayout(selected.document, {
    guest: { name: previewGuest?.fullName ?? '', email: previewGuest?.email ?? '' },
    table: { name: previewTableName },
    event: { title: event.name, date: event.startAt ?? null, venue: event.venue ?? null, coupleNames: event.coupleNames ?? null, invitationText: event.invitationText ?? null },
    ceremonies: event.ceremonies.map((ceremony) => ({ name: ceremony.name, date: ceremony.date ?? null, time: ceremony.time ?? null, venue: ceremony.venue ?? null, address: ceremony.address ?? null, reference: ceremony.reference ?? null, dressCode: ceremony.dressCode ?? null })),
    qr: { available: false },
    variables: variableMap,
  }, undefined, imageUrls) : null;
  const canvas = selected?.document.canvas;
  const rawSafeMargin = selected?.document.constraints.safeMargin ?? 64;
  const safeMargins = typeof rawSafeMargin === 'number' ? { top: rawSafeMargin, right: rawSafeMargin, bottom: rawSafeMargin, left: rawSafeMargin } : rawSafeMargin;
  const stageWidth = 390;
  const stageHeight = canvas ? Math.round(stageWidth * canvas.height / canvas.width) : 694;

  return <main className="events-shell design-page">
    <AppNavbar eventId={event.id} />
    <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(eventChange) => void uploadCouplePhoto(eventChange)} />
    <header className="design-heading"><div><p className="eyebrow">ATELIER DE CRÉATION · {event.name}</p><h1>Composez votre<br /><em>invitation.</em></h1><p>Choisissez un modèle, adaptez chaque détail et retrouvez vos versions à tout moment.</p></div><Link className="design-back" href="/events">← Tous les événements</Link></header>
    {previewTemplate && <dialog className="template-preview-dialog" open aria-labelledby="template-preview-title" aria-modal="true" onCancel={() => setPreviewTemplate(null)}><div className="template-preview-card"><button type="button" className="template-preview-close" onClick={() => setPreviewTemplate(null)} aria-label="Fermer l’aperçu">×</button><span className="design-kicker">APERÇU DU STYLE · VERSION {previewTemplate.version}</span>{previewTemplate.tags.includes('PROFESSIONAL') && <ProfessionalTemplatePreview eventId={event.id} templateId={previewTemplate.id} snapshot={{ guest: { name: 'Invité — DEMO' }, event: { title: event.name, coupleNames: event.coupleNames ?? null, invitationText: event.invitationText ?? null, date: event.startAt ?? null, venue: event.venue ?? null }, ceremonies: event.ceremonies, qr: { available: false } }} />}<div className="template-preview-art" style={{ background: previewTemplate.preview.background, display: previewTemplate.tags.includes('PROFESSIONAL') ? 'none' : undefined }}><span className="poster-frame" style={{ borderColor: previewTemplate.preview.accent }}><span className="poster-ornament" style={{ color: previewTemplate.preview.accent }}>✳</span><span className="poster-rule" style={{ background: previewTemplate.preview.accent }} /><strong style={{ color: previewTemplate.preview.style === 'MIDNIGHT_BLUE' ? '#F7F0E4' : '#302D2A' }}>{previewTemplate.name}</strong><span className="poster-rule short" style={{ background: previewTemplate.preview.accent }} /><small style={{ color: previewTemplate.preview.accent }}>{previewTemplate.category === 'WEDDING' ? 'CÉLÉBRATION' : previewTemplate.category}</small></span></div><h2 id="template-preview-title">{previewTemplate.name}</h2><p>{previewTemplate.description}</p><p className="template-preview-meta">Illustration de style fondée sur les métadonnées du catalogue · {previewTemplate.style} · {previewTemplate.ceremonyTypes.join(', ')}</p><div className="template-tags">{previewTemplate.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="template-preview-actions"><button type="button" className="template-preview-action" onClick={() => setPreviewTemplate(null)}>Continuer à parcourir</button><button type="button" className="template-choose" disabled={busy} onClick={() => void createFromTemplate(previewTemplate)}>Choisir ce modèle <span>→</span></button></div></div></dialog>}
    {message && <p className="design-status" role="status">{message}</p>}
    {resolvedPreview && (resolvedPreview.errors.length > 0 || resolvedPreview.warnings.length > 0) && <div className="design-status" role="status"><strong>Vérification impression A5</strong>{resolvedPreview.errors.map((issue, index) => <p key={`error-${index}`}>Erreur · {issue.elementId} : {issue.message}</p>)}{resolvedPreview.warnings.map((issue, index) => <p key={`warning-${index}`}>Attention · {issue.elementId} : {issue.message}</p>)}</div>}
    {selected && resolvedPreview?.errors.filter(issue => issue.code === 'TEXT_OVERFLOW_ASSISTANCE_AVAILABLE').map(issue => {
      const layer = resolvedPreview.elements.find(entry => entry['id'] === issue.elementId);
      const fields = selected.document.metadata['editorialFields'] as { elementId: string }[] | undefined;
      if (!layer || !fields?.some(field => field.elementId === issue.elementId)) return null;
      return <EditorialAssist key={selected.id + ':' + selected.version + ':' + issue.elementId} eventId={event.id} designId={selected.id} sourceVersion={selected.version} elementId={issue.elementId!} sourceText={String(layer['resolvedText'] ?? '')} dirty={dirty} onAccepted={() => selectDesign(selected)} onTemplate={() => { if (dirty && !window.confirm('Quitter sans enregistrer ?')) return; setSelected(null); setSavedDocument(null); }} />;
    })}
    {loading ? <section className="design-state"><p>Chargement de la bibliothèque enregistrée…</p></section> : <>
      {!selected ? <div className="design-catalog-layout"><section className="design-catalog">
        {designs.length > 0 && <section className="journey-existing-design" aria-label="Design déjà enregistré"><div><strong>Vous avez déjà un design pour cet événement.</strong><p>Reprenez votre création ou explorez d’autres propositions sans remplacer le design enregistré.</p></div><button type="button" disabled={busy} onClick={() => void selectDesign(designs[0]!)}>Continuer mon design</button><a href="#ai-composer-title">Explorer d’autres propositions</a></section>}
        <AIComposer event={event} busy={busy} onChoose={async proposal => {
          if (designs.length > 0 && !window.confirm('Votre design actuel restera enregistré. Créer cette proposition comme un nouveau design ?')) return;
          setBusy(true); setMessage('');
          try {
            const created = await api<Design>(event.id, 'composer/select', 'POST', { name: `${String(proposal.document['metadata']['name'] ?? proposal.recipeId)} · ${event.name}`, document: proposal.document });
            await refresh(); await selectDesign(created); setMessage('Votre composition est créée et enregistrée en version 1.');
          } catch (error) { setMessage(error instanceof Error ? error.message : 'Impossible de choisir cette composition.'); }
          finally { setBusy(false); }
        }} />
        <div className="design-section-title"><div><span className="design-kicker">BIBLIOTHÈQUE</span><h2>Choisissez une composition</h2></div>
          <label>Rechercher<input type="search" value={templateSearch} onChange={(eventChange) => setTemplateSearch(eventChange.target.value)} placeholder="Nom, style ou mot-clé" /></label>
          <label>Catégorie<select value={category} onChange={(eventChange) => setCategory(eventChange.target.value)}><option value="ALL">Toutes</option><option value="WEDDING">Mariage</option><option value="BIRTHDAY">Anniversaire</option><option value="GRADUATION">Graduation</option><option value="BAPTISM">Baptême</option><option value="BABY_SHOWER">Baby shower</option><option value="GALA">Gala</option><option value="CONFERENCE">Conférence</option></select></label>
          <label>Cérémonie<select aria-label="Filtrer par type de cérémonie" value={ceremonyType} onChange={(eventChange) => setCeremonyType(eventChange.target.value)}><option value="ALL">Toutes</option>{eventCeremonyTypes.map((type) => <option key={type} value={type}>{({ CIVIL: 'Civile', RELIGIOUS: 'Religieuse', RECEPTION: 'Réception', DOT: 'Dot', TRADITIONAL: 'Traditionnelle', CUSTOM: 'Personnalisée', UNIVERSAL: 'Universelle' } as Record<string, string>)[type] ?? type}</option>)}</select></label>
        </div>
        <p className="template-pricing-note" role="status">{mediaError || (mediaInventory ? (mediaInventory.hasPhotos ? 'Photos privées du compte disponibles : compositions avec ou sans photo.' : 'Aucune photo privée disponible : compositions sans photo.') : 'Vérification des photos privées… Compositions sans photo disponibles.')}</p><p className="template-pricing-note">Le catalogue actuel ne fournit pas de niveau Gratuit/Premium ni de prix; aucun tarif ni badge n’est affiché sans donnée Billing fiable.</p>
        {catalogError ? <div className="design-state design-error" role="alert"><p>{catalogError}</p><button onClick={() => void refresh()}>Réessayer</button></div>
          : filteredTemplates.length ? <div className="template-grid">{filteredTemplates.map((template) => <article className="template-card" key={template.id}>
            <div className="template-poster" style={{ background: template.preview.background }} aria-hidden="true"><span className="poster-frame" style={{ borderColor: template.preview.accent }}><span className="poster-ornament" style={{ color: template.preview.accent }}>✳</span><span className="poster-rule" style={{ background: template.preview.accent }} /><strong style={{ color: template.preview.style === 'MIDNIGHT_BLUE' ? '#F7F0E4' : '#302D2A' }}>{template.name}</strong><span className="poster-rule short" style={{ background: template.preview.accent }} /><small style={{ color: template.preview.accent }}>{template.category === 'WEDDING' ? 'CÉLÉBRATION' : template.category}</small></span></div>
            <div className="template-info"><div><span>{template.category === 'WEDDING' ? 'MARIAGE' : template.category}</span><span>{template.style}</span><span>VERSION {template.version}</span></div><h3>{template.name}</h3><p>{template.description}</p><div className="template-tags">{template.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <div className="template-card-actions"><button className="template-preview-action" onClick={() => setPreviewTemplate(template)}>Voir le style</button><button className="template-choose" disabled={busy} onClick={() => void createFromTemplate(template)}>Choisir ce modèle <span>→</span></button></div>
            </div></article>)}</div>
          : <div className="design-state"><p>{templates.length ? 'Aucun modèle ne correspond à ces filtres. Essayez une autre recherche ou catégorie.' : 'Aucun modèle actif ne correspond aux cérémonies de cet événement.'}</p></div>}</section>
        <aside className="design-saved"><span className="design-kicker">VOTRE ESPACE</span><h2>Vos créations</h2>{designs.length ? <div className="saved-list">{designs.map((design) => <button key={design.id} onClick={() => void selectDesign(design)} disabled={busy}><span className="saved-palette" style={{
  background: String(
    design.document?.theme?.tokens?.background ?? '#F5F0E8'
  ),
}} /><span><strong>{design.name}</strong><small>Version {design.version} · Modifié {new Date(design.updatedAt).toLocaleDateString('fr-FR')}</small></span><span>Personnaliser →</span></button>)}</div> : <p className="saved-empty">Vos designs enregistrés apparaîtront ici.</p>}</aside></div> : <section className="editor-shell">
        <div className="editor-toolbar"><button className="editor-return" onClick={() => { if (dirty && !window.confirm('Les changements non enregistrés seront perdus. Quitter ?')) return; setSelected(null); setSavedDocument(null); setSavedName(''); setHistory([]); setFuture([]); }}>← Bibliothèque</button><div className="editor-title"><input aria-label="Nom du design" value={selected.name} onChange={(eventChange) => setSelected({ ...selected, name: eventChange.target.value })} maxLength={120} /><span>v{selected.version}{dirty ? ' · Modifications non enregistrées' : ' · Enregistré'}</span></div><div className="editor-actions"><button title="Annuler (Ctrl/⌘+Z)" disabled={!history.length || busy} onClick={undo}>↶</button><button title="Rétablir (Ctrl/⌘+Maj+Z)" disabled={!future.length || busy} onClick={redo}>↷</button><button disabled={!dirty || busy} onClick={() => void save()}>Enregistrer</button></div></div>
        <nav className="editor-mobile-tabs" aria-label="Panneaux de l’éditeur">{([['canvas', 'Aperçu'], ['layers', 'Calques'], ['settings', 'Réglages']] as const).map(([panel, label]) => <button type="button" key={panel} aria-pressed={mobileEditorPanel === panel} className={mobileEditorPanel === panel ? 'active' : ''} onClick={() => setMobileEditorPanel(panel)}>{label}</button>)}</nav>
        <div className="editor-body" data-mobile-panel={mobileEditorPanel}><aside className="editor-panel editor-left"><span className="design-kicker">CALQUES · {selected.document.elements.length}</span><div className="layer-list">{[...selected.document.elements].sort((a, b) => b.zIndex - a.zIndex).map((layer) => <button key={layer.id} className={activeLayerId === layer.id ? 'active' : ''} onClick={() => { setActiveLayerId(layer.id); setMobileEditorPanel('settings'); }}><span className={`layer-icon ${layer.type.toLowerCase()}`}>{layer.type === 'TEXT' ? 'T' : layer.type === 'BACKGROUND' ? '◧' : layer.type === 'QR' ? '▦' : layer.type === 'IMAGE' ? '▧' : '□'}</span><span><strong>{layer.name}</strong><small>{layer.type === 'TEXT' ? 'Texte dynamique' : layer.type === 'BACKGROUND' ? 'Arrière-plan' : layer.type === 'QR' ? 'QR invité' : layer.type === 'IMAGE' ? 'Photo' : 'Rectangle'}{layer.locked ? ' · verrouillé' : ''}</small></span>{layer.editable && !layer.locked && <i>✳</i>}</button>)}</div><div className="layer-add" style={{ display: selected.document.metadata['personalization'] ? 'none' : undefined }}><button onClick={addText} disabled={busy}>＋ Ajouter du texte</button><button onClick={addShape} disabled={busy}>＋ Ajouter un cadre</button><button onClick={() => { imageReplaceLayerId.current = null; imageInputRef.current?.click(); }} disabled={busy || imageUploading || selected.document.elements.length >= 100}>＋ Ajouter une photo</button><button onClick={addQr} disabled={busy || selected.document.elements.some((layer) => layer.type === 'QR')}>＋ Ajouter un QR invité</button></div></aside>
          <section className="editor-stage"><div className="stage-bar"><div className="preview-guest-picker"><span className="design-kicker">APERÇU AVANT GÉNÉRATION · SANS CONSOMMATION DE CRÉDIT</span>{event.ceremonies.length > 0 && <label>Cérémonie<select aria-label="Cérémonie de l’aperçu" value={previewCeremonyId} onChange={(eventChange) => setPreviewCeremonyId(eventChange.target.value)}>{event.ceremonies.map((ceremony) => <option value={ceremony.id} key={ceremony.id}>{ceremony.name}</option>)}</select></label>}<label>Rechercher un invité<input type="search" value={previewGuestSearch} onChange={(eventChange) => setPreviewGuestSearch(eventChange.target.value)} placeholder="Nom d’un invité" maxLength={160} /></label><label>Invité de test<select aria-label="Invité pour l’aperçu" value={previewGuest?.id ?? ''} onChange={(eventChange) => setPreviewGuest(previewGuests.find((guest) => guest.id === eventChange.target.value) ?? null)}><option value="">Valeurs du modèle</option>{previewGuest && !previewGuests.some((guest) => guest.id === previewGuest.id) && <option value={previewGuest.id}>{previewGuest.fullName}</option>}{previewGuests.map((guest) => <option value={guest.id} key={guest.id}>{guest.fullName}{guest.email ? ` · ${guest.email}` : ''}</option>)}</select></label>{previewGuestError && <small role="alert">{previewGuestError}</small>}{previewCeremonyId && <small>{event.ceremonies.find((ceremony) => ceremony.id === previewCeremonyId)?.name} · {event.ceremonies.find((ceremony) => ceremony.id === previewCeremonyId)?.ceremonyType}</small>}</div><div><button onClick={() => setShowSafeMargins((visible) => !visible)} aria-pressed={showSafeMargins}>{showSafeMargins ? 'Masquer les marges' : 'Afficher les marges de sécurité'}</button><button onClick={() => setDragMode((enabled) => !enabled)} aria-pressed={dragMode} className={dragMode ? 'selected-tool' : ''}>{dragMode ? '✥ Déplacement actif' : '↖ Sélection'}</button><button onClick={() => setZoom((value) => Math.max(0.24, value - 0.04))} aria-label="Zoom arrière">−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(0.52, value + 0.04))} aria-label="Zoom avant">＋</button></div></div><div className="stage-scroll"><div className="design-canvas" ref={stageRef} style={{ width: stageWidth, height: stageHeight, transform: `scale(${zoom / (stageWidth / 1080)})`, transformOrigin: 'top center', marginBottom: stageHeight * (zoom / (stageWidth / 1080) - 1) }}><svg viewBox={`0 0 ${canvas!.width} ${canvas!.height}`} width="100%" height="100%" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} style={{ cursor: dragMode ? 'grab' : 'default', touchAction: 'none' }}>
            {resolvedPreview && <g pointerEvents="none" dangerouslySetInnerHTML={{ __html: renderResolvedLayoutSvg(resolvedPreview, { assets: imageUrls, fragment: true }) }} />}
            {[...(resolvedPreview?.elements ?? []), ...selected.document.elements.filter((element) => element.type === 'QR')].map((resolved, index) => {
              const sourceId = String(resolved['sourceElementId'] ?? resolved.id);
              const source = selected.document.elements.find((element) => element.id === sourceId);
              if (!source) return null;
              const layer = resolved as Layer;
              const isActive = activeLayerId === sourceId;
              const fontScale = 1080 / canvas!.width;
              return <g key={sourceId + '-' + index} transform={`rotate(${layer.rotation ?? 0} ${layer.x + layer.width / 2} ${layer.y + layer.height / 2})`} onPointerDown={(eventPointer) => beginDrag(eventPointer, source)} onClick={() => setActiveLayerId(sourceId)}>
                <rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} fill="transparent" />
                {layer.type === 'IMAGE' && !imageUrls[layer.assetId ?? ''] && <><rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} fill="#f2eadf" stroke="#b58b58" strokeDasharray="12 8" /><text x={layer.x + layer.width / 2} y={layer.y + layer.height / 2} textAnchor="middle" fontFamily="Arial" fontSize={24}>Média indisponible ou en chargement</text></>}
                {layer.type === 'QR' && <><rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} fill="none" stroke="#8d7c91" strokeDasharray="12 8" /><text x={layer.x + layer.width / 2} y={layer.y + layer.height / 2} textAnchor="middle" fontFamily="Arial" fontSize={18}>Emplacement QR · rendu final</text></>}
                {isActive && layer.type !== 'BACKGROUND' && <rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} fill="none" stroke="#ba8065" strokeWidth={4 / fontScale} strokeDasharray={`${8 / fontScale} ${6 / fontScale}`} pointerEvents="none" />}
              </g>;
            })}
            {showSafeMargins && <rect x={safeMargins.left} y={safeMargins.top} width={Math.max(1, canvas!.width - safeMargins.left - safeMargins.right)} height={Math.max(1, canvas!.height - safeMargins.top - safeMargins.bottom)} fill="none" stroke="#bc754f" strokeWidth={5} strokeDasharray="18 12" pointerEvents="none" />}</svg></div></div><div className="stage-footnote">{canvas!.width} × {canvas!.height} px · Format {selected.document.layouts[0]?.name}</div></section>
          {(selected.document.metadata['personalization'] as { policy?: string } | undefined)?.policy === 'professional-v1' && <ProfessionalTemplateInspector metadata={selected.document.metadata} elements={selected.document.elements} uploading={imageUploading} onPhoto={(elementId) => { imageReplaceLayerId.current = elementId; imageInputRef.current?.click(); }} onCrop={(elementId, change) => editDocument((document) => { const layer = document.elements.find((item) => item.id === elementId); if (layer) Object.assign(layer, change); })} onColor={(color) => editDocument((document) => { for (const layer of document.elements) if (layer.type === 'TEXT') layer.color = color; })} onFont={(fontId) => editDocument((document) => { for (const layer of document.elements) if (layer.type === 'TEXT') { layer['fontId'] = fontId; layer.fontFamily = fontId === 'arial' ? 'Arial' : 'Georgia'; } })} onReuse={(slotId) => editDocument((document) => { const main = document.elements.find((layer) => layer.id === 'main-photo' && layer.type === 'IMAGE'); if (main?.assetId && main.sourceWidth && main.sourceHeight) Object.assign(document, fillProfessionalPhotoSlot(document, slotId, { assetId: main.assetId, width: main.sourceWidth, height: main.sourceHeight })); })} />}
          <aside style={(selected.document.metadata['personalization'] as { policy?: string } | undefined)?.policy === 'professional-v1' ? { display: 'none' } : undefined} className="editor-panel editor-right"><span className="design-kicker">PERSONNALISATION</span><h2>{openLayer?.name ?? 'Votre design'}</h2>{openLayer && <div className="layer-tools"><button disabled={openLayer.type === 'BACKGROUND'} onClick={() => moveLayerInStack(openLayer, -1)} title="Descendre le calque">↓ Arrière</button><button disabled={openLayer.type === 'BACKGROUND'} onClick={() => moveLayerInStack(openLayer, 1)} title="Monter le calque">↑ Avant</button><button disabled={openLayer.type === 'BACKGROUND'} onClick={() => toggleLayerLock(openLayer)}>{openLayer.locked ? 'Déverrouiller' : 'Verrouiller'}</button><button disabled={openLayer.locked || openLayer.type === 'BACKGROUND'} onClick={() => duplicateLayer(openLayer)}>Dupliquer</button></div>}{!openLayer?.locked && openLayer?.type === 'IMAGE' ? <ImageInspector layer={openLayer} canvas={canvas!} uploading={imageUploading} backgroundStatus={backgroundJobs[openLayer.originalAssetId ?? openLayer.assetId ?? '']?.status ?? 'NONE'} backgroundDerivedAssetId={backgroundJobs[openLayer.originalAssetId ?? openLayer.assetId ?? '']?.derivedAssetId ?? openLayer.derivedAssetId} onRemoveBackground={() => void startBackgroundRemoval(openLayer.originalAssetId ?? openLayer.assetId ?? '')} onRetryBackground={() => void startBackgroundRemoval(openLayer.originalAssetId ?? openLayer.assetId ?? '')} onUseOriginal={() => choosePhotoVersion(openLayer, openLayer.originalAssetId ?? openLayer.assetId ?? '')} onUseDerived={() => { const derived = backgroundJobs[openLayer.originalAssetId ?? openLayer.assetId ?? '']?.derivedAssetId ?? openLayer.derivedAssetId; if (derived) choosePhotoVersion(openLayer, derived, derived); }} onReplace={() => { imageReplaceLayerId.current = openLayer.id; imageInputRef.current?.click(); }} onDelete={() => { editDocument((document) => { document.elements = document.elements.filter((layer) => layer.id !== openLayer.id); }); setActiveLayerId(null); }} onChange={(change) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id); if (target) change(target); })} /> : null}{openLayer?.locked ? <p className="inspector-note">Ce calque est verrouillé. Vous pouvez le déverrouiller pour le modifier.</p> : openLayer?.type === 'QR' ? <div className="inspector-fields"><p className="inspector-note">Un QR privé distinct est généré pour chaque invité lors du rendu final.</p><div className="inspector-pair"><label>Largeur<input type="number" min="64" max={canvas!.width - openLayer.x} value={Math.round(openLayer.width)} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.width = Number(eventChange.target.value); })} /></label><label>Hauteur<input type="number" min="64" max={canvas!.height - openLayer.y} value={Math.round(openLayer.height)} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.height = Number(eventChange.target.value); })} /></label></div><button className="danger-action" onClick={() => { editDocument((document) => { document.elements = document.elements.filter((layer) => layer.id !== openLayer.id); }); setActiveLayerId(null); }}>Supprimer ce QR</button></div> : openLayer?.type === 'TEXT' ? <div className="inspector-fields"><label>Nom du calque<input value={openLayer.name} maxLength={100} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.name = eventChange.target.value; })} /></label><label>Contenu<textarea value={openLayer.text ?? ''} maxLength={500} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.text = eventChange.target.value; })} /></label><label>Alignement<select value={openLayer.align} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.align = eventChange.target.value as NonNullable<Layer['align']>; })}><option value="left">À gauche</option><option value="center">Centré</option><option value="right">À droite</option></select></label><div className="inspector-pair"><label>Corps<input type="number" min="8" max="180" value={openLayer.fontSize} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.fontSize = Number(eventChange.target.value); })} /></label><label>Couleur<input type="color" value={openLayer.color} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.color = eventChange.target.value; })} /></label></div><label>Police<select value={openLayer.fontFamily} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.fontFamily = eventChange.target.value; })}><option value="Georgia">Georgia</option><option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option></select></label><div className="inspector-pair"><label>Largeur<input type="number" min="1" max={canvas!.width - openLayer.x} value={Math.round(openLayer.width)} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.width = Number(eventChange.target.value); })} /></label><label>Hauteur<input type="number" min="1" max={canvas!.height - openLayer.y} value={Math.round(openLayer.height)} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.height = Number(eventChange.target.value); })} /></label></div><div className="inspector-pair"><label>Rotation<input type="number" min="-360" max="360" value={openLayer.rotation} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.rotation = Number(eventChange.target.value); })} /></label><label>Position X<input type="number" min="0" max={canvas!.width - openLayer.width} value={Math.round(openLayer.x)} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.x = Number(eventChange.target.value); })} /></label></div><label className="position-fields">Position Y<input type="number" min="0" max={canvas!.height - openLayer.height} value={Math.round(openLayer.y)} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.y = Number(eventChange.target.value); })} /></label><button className="danger-action" onClick={() => { editDocument((document) => { document.elements = document.elements.filter((layer) => layer.id !== openLayer.id); }); setActiveLayerId(null); }}>Supprimer ce calque</button></div> : openLayer?.type === 'SHAPE' ? <div className="inspector-fields"><label>Nom du calque<input value={openLayer.name} maxLength={100} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.name = eventChange.target.value; })} /></label><div className="inspector-pair"><label>Remplissage<input type="color" value={openLayer.fill === 'transparent' ? '#ffffff' : openLayer.fill} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.fill = eventChange.target.value; })} /></label><label>Contour<input type="color" value={openLayer.stroke} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.stroke = eventChange.target.value; })} /></label></div><p className="inspector-note">Cadre rectangulaire éditable.</p><button className="danger-action" onClick={() => { editDocument((document) => { document.elements = document.elements.filter((layer) => layer.id !== openLayer.id); }); setActiveLayerId(null); }}>Supprimer ce calque</button></div> : openLayer?.type === 'IMAGE' ? null : <div className="inspector-fields"><label>Palette principale<input type="color" value={selected.document.theme.tokens.primary} onChange={(eventChange) => editDocument((document) => { document.theme.tokens.primary = eventChange.target.value; for (const layer of document.elements) if (layer.type === 'SHAPE' && layer.stroke === selected.document.theme.tokens.primary) layer.stroke = eventChange.target.value; })} /></label><label>Fond du canevas<input type="color" value={selected.document.theme.tokens.background} onChange={(eventChange) => editDocument((document) => { document.theme.tokens.background = eventChange.target.value; const background = document.elements.find((layer) => layer.type === 'BACKGROUND'); if (background) background.fill = eventChange.target.value; })} /></label><p className="inspector-note">Format portrait · {selected.document.canvas.width} × {selected.document.canvas.height} px</p></div>}
            <div className="inspector-section ai-assistant"><span className="design-kicker">ASSISTANT DE CRÉATION</span><p>Décrivez une ambiance. L’assistant propose des changements structurés et vous gardez la main avant l’enregistrement.</p><textarea value={aiPrompt} onChange={(eventChange) => setAiPrompt(eventChange.target.value)} maxLength={2000} minLength={8} placeholder="Ex. une ambiance africaine contemporaine, tons émeraude et dorés, élégante et très lisible…" disabled={aiBusy || aiJob?.status === 'QUEUED' || aiJob?.status === 'PROCESSING'} /><button className="ai-request-action" onClick={() => void requestAiProposal()} disabled={!selected || dirty || aiBusy || aiPrompt.trim().length < 8 || aiJob?.status === 'QUEUED' || aiJob?.status === 'PROCESSING'}>{aiJob?.status === 'QUEUED' || aiJob?.status === 'PROCESSING' ? 'Création en cours…' : aiBusy ? 'Envoi…' : 'Demander une proposition'}</button>{dirty && <small>Enregistrez vos modifications avant de demander une proposition.</small>}{aiJob && <div className={`ai-result ${aiJob.status.toLowerCase()}`}><strong>{aiJob.status === 'QUEUED' ? 'En attente dans la file' : aiJob.status === 'PROCESSING' ? 'Analyse du design en cours' : aiJob.status === 'PROPOSED' ? 'Proposition prête' : aiJob.status === 'CANCELLED' ? 'Demande annulée' : 'Proposition indisponible'}</strong>{aiJob.summary && <p>{aiJob.summary}</p>}{aiJob.status === 'PROPOSED' && <>{aiJob.previewAvailable && <Image className="ai-preview-image" src={`/api/events/${encodeURIComponent(event.id)}/designs/${encodeURIComponent(selected.id)}/ai-jobs/${encodeURIComponent(aiJob.id)}/preview`} alt="Aperçu généré de l’arrière-plan" width={960} height={540} unoptimized />}{!aiJob.previewAvailable && <small className="ai-provider-label">Aucun aperçu image en mode local simulé</small>}<small className="ai-provider-label">{aiJob.provider === 'mock' ? 'Mode local simulé · aucun modèle IA appelé' : 'Fournisseur auto-hébergé'}</small><button className="ai-apply-action" onClick={applyAiProposal} disabled={dirty || selected.version !== aiJob.baseVersion}>Appliquer cette proposition</button>{selected.version !== aiJob.baseVersion && <small>Le design a changé depuis cette demande. Lancez une nouvelle proposition.</small>}</>}{aiJob.status === 'FAILED' && <><small>{aiJob.errorCode === 'provider_unavailable' ? 'Le fournisseur auto-hébergé est indisponible ou non configuré.' : aiJob.errorCode === 'invalid_proposal' ? 'La proposition reçue ne respecte pas les règles du design.' : 'La génération n’a pas abouti.'}</small><button className="ai-apply-action" disabled={aiBusy || aiJob.attempt >= 3} onClick={() => void retryAiJob()}>{aiJob.attempt >= 3 ? 'Limite de tentatives atteinte' : 'Réessayer'}</button></>}</div>}</div>
            <div className="inspector-section"><span className="design-kicker">VARIABLES DU MODÈLE</span>{selected.document.variables.map((variable) => <label key={variable.key}>{variable.label}{variable.required && <b> · requis</b>}<input value={variable.defaultValue} onChange={(eventChange) => editDocument((document) => { const target = document.variables.find((item) => item.key === variable.key)!; target.defaultValue = eventChange.target.value; })} maxLength={500} /></label>)}</div>
            <div className="inspector-section version-section"><span className="design-kicker">HISTORIQUE · {versions.length}</span><div className="version-list">{versions.slice(0, 8).map((version) => <div key={version.version}><span><strong>Version {version.version}</strong><small>{new Date(version.createdAt).toLocaleString('fr-FR')}</small></span>{version.version !== selected.version && <button disabled={busy} onClick={() => void restoreVersion(version.version)}>Restaurer</button>}</div>)}</div></div>
            <div className="inspector-section"><button className="validate-action" disabled={busy || dirty} onClick={() => void inspect()}>{dirty ? 'Enregistrez avant de vérifier' : 'Vérifier le placement'}</button>{validation && <div className={validation.valid ? 'validation-good' : 'validation-issues'}>{validation.valid ? `${validation.checked} calques vérifiés. Aucun débordement détecté.` : validation.problems.map((problem, index) => <p key={`${problem.layerId}-${index}`}>{problem.message}</p>)}{validation.variables.some((variable) => variable.required && !variable.label.trim()) && <p>Une variable obligatoire n’est pas renseignée.</p>}</div>}</div>
            <button className="danger-action archive-action" disabled={busy} onClick={() => void archive()}>Archiver le design</button>
          </aside>
        </div><div className="editor-mobile-actions"><button disabled={!history.length} onClick={undo}>↶ Annuler</button><button disabled={!future.length} onClick={redo}>↷ Rétablir</button><button disabled={!dirty || busy} onClick={() => void save()}>Enregistrer</button></div>
      </section>}
    </>}
  </main>;
}
