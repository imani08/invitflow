'use client';

import Link from 'next/link';
import { resolveGuestPreviewValues } from '@/lib/design-guest-preview.mjs';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Layer = Record<string, unknown> & { id: string; name: string; type: 'BACKGROUND' | 'TEXT' | 'SHAPE'; x: number; y: number; width: number; height: number; rotation: number; locked: boolean; editable: boolean; zIndex: number; fill?: string; stroke?: string; strokeWidth?: number; text?: string; fontFamily?: string; fontSize?: number; fontWeight?: number; align?: 'left' | 'center' | 'right'; color?: string };
type Document = { schemaVersion: 1; metadata: Record<string, unknown>; canvas: { width: number; height: number; unit: 'px' }; theme: { category: string; style: string; palette: string[]; tokens: { primary: string; secondary: string; background: string; font: string } }; assets: Record<string, unknown>[]; elements: Layer[]; variables: { key: string; label: string; type: 'TEXT'; defaultValue: string; required: boolean }[]; constraints: { safeMargin: number; allowOverflow: boolean }; layouts: { id: string; name: string; width: number; height: number }[]; ceremonyRules: Record<string, unknown>[]; exportProfiles: { id: string; width: number; height: number; unit: 'px' }[]; version: number };
type Event = { id: string; name: string; status: string; timezone: string; ceremonies: { id: string; name: string; ceremonyType: string }[] };
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
function renderText(text: string, values: Record<string, string>) {
  return text.replace(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g, (_, key: string) => values[key] ?? '');
}

function wrapText(text: string, capacity: number) {
  const rows: string[] = [];
  for (const paragraph of text.split('\n')) {
    let row = '';
    for (const word of paragraph.split(/\s+/)) {
      if (row && `${row} ${word}`.length > capacity) { rows.push(row); row = word; }
      else row = row ? `${row} ${word}` : word;
      while (row.length > capacity) { rows.push(row.slice(0, capacity)); row = row.slice(capacity); }
    }
    rows.push(row);
  }
  return rows.length ? rows : [''];
}

function svgRect(layer: Layer, scale: number, key: string) {
  return <rect key={key} x={layer.x * scale} y={layer.y * scale} width={layer.width * scale} height={layer.height * scale} fill={layer.fill === 'transparent' ? 'none' : layer.fill} stroke={layer.stroke} strokeWidth={(layer.strokeWidth ?? 0) * scale} />;
}

export function DesignsWorkspace({ event }: { event: Event }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [selected, setSelected] = useState<Design | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('ALL');
  const [ceremonyType, setCeremonyType] = useState('ALL');
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
  const [aiBusy, setAiBusy] = useState(false);
  const [previewGuests, setPreviewGuests] = useState<PreviewGuest[]>([]);
  const [previewGuest, setPreviewGuest] = useState<PreviewGuest | null>(null);
  const [previewGuestSearch, setPreviewGuestSearch] = useState('');
  const [previewGuestError, setPreviewGuestError] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ id: number; layerId: string; x: number; y: number; moved: boolean; start: Document } | null>(null);
  const openLayer = selected?.document.elements.find((layer) => layer.id === activeLayerId) ?? null;
  const dirty = !!selected && !!savedDocument && (selected.name !== savedName || JSON.stringify(selected.document) !== JSON.stringify(savedDocument));
  const eventCeremonyTypes = useMemo(() => [...new Set(event.ceremonies.map((ceremony) => ceremony.ceremonyType.toUpperCase() === 'OTHER' ? 'CUSTOM' : ceremony.ceremonyType.toUpperCase()))], [event.ceremonies]);
  const filteredTemplates = useMemo(() => templates.filter((template) => (category === 'ALL' || template.category === category) && (ceremonyType === 'ALL' || template.ceremonyTypes.includes('UNIVERSAL') || template.ceremonyTypes.includes(ceremonyType))), [templates, category, ceremonyType]);

  const refresh = useCallback(async () => {
    setLoading(true); setMessage('');
    try {
      const [templateResponse, designResponse] = await Promise.all([
        api<{ items: Template[] }>(event.id, 'templates'), api<{ items: Design[] }>(event.id, ''),
      ]);
      setTemplates(templateResponse.items); setDesigns(designResponse.items);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Chargement impossible.'); }
    finally { setLoading(false); }
  }, [event.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!selected) return;
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
  }, [event.id, previewGuestSearch, selected?.id]);

  useEffect(() => {
    if (!aiJob || !selected || aiJob.status === 'PROPOSED' || aiJob.status === 'FAILED' || aiJob.status === 'CANCELLED') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const latest = await api<AiJob>(event.id, `${encodeURIComponent(selected.id)}/ai-jobs/${encodeURIComponent(aiJob.id)}`);
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
  }, [event.id, selected?.id, aiJob?.id, aiJob?.status]);

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
      setHistory([]); setFuture([]);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ouverture impossible.'); }
    finally { setBusy(false); }
  }, [event.id]);

  function editDocument(edit: (document: Document) => void) {
    if (!selected) return;
    const previous = clone(selected.document);
    const document = clone(selected.document);
    edit(document);
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
      const design = await api<Design>(event.id, '', 'POST', { templateId: template.id, name: `${template.name} · ${event.name}` });
      await refresh(); await selectDesign(design); setMessage('Le design a été créé et enregistré.');
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

  const variableMap = selected ? resolveGuestPreviewValues(selected.document.variables, previewGuest) : {};
  const canvas = selected?.document.canvas;
  const stageWidth = 390;
  const stageHeight = canvas ? Math.round(stageWidth * canvas.height / canvas.width) : 694;

  return <main className="events-shell design-page">
    <nav className="events-nav"><Link className="brand" href="/">Invita<span>Flow</span></Link><div><a href="/events">Événements</a><a href={`/events/${encodeURIComponent(event.id)}/guests`}>Invités</a><a href={`/events/${encodeURIComponent(event.id)}/seating`}>Placement</a><form action="/api/auth/logout" method="post"><button>Déconnexion</button></form></div></nav>
    <header className="design-heading"><div><p className="eyebrow">ATELIER DE CRÉATION · {event.name}</p><h1>Composez votre<br /><em>invitation.</em></h1><p>Choisissez un modèle, adaptez chaque détail et retrouvez vos versions à tout moment.</p></div><a className="design-back" href="/events">← Tous les événements</a></header>
    {message && <p className="design-status" role="status">{message}</p>}
    {loading ? <section className="design-state"><p>Chargement de la bibliothèque enregistrée…</p></section> : <>
      {!selected ? <div className="design-catalog-layout"><section className="design-catalog"><div className="design-section-title"><div><span className="design-kicker">BIBLIOTHÈQUE</span><h2>Choisissez une composition</h2></div><label>Catégorie<select value={category} onChange={(eventChange) => setCategory(eventChange.target.value)}><option value="ALL">Toutes</option><option value="WEDDING">Mariage</option><option value="BIRTHDAY">Anniversaire</option><option value="GRADUATION">Graduation</option><option value="BAPTISM">Baptême</option><option value="BABY_SHOWER">Baby shower</option><option value="GALA">Gala</option><option value="CONFERENCE">Conférence</option></select></label><label>Cérémonie<select aria-label="Filtrer par type de cérémonie" value={ceremonyType} onChange={(eventChange) => setCeremonyType(eventChange.target.value)}><option value="ALL">Toutes</option>{eventCeremonyTypes.map((type) => <option key={type} value={type}>{({ CIVIL: 'Civile', RELIGIOUS: 'Religieuse', RECEPTION: 'Réception', DOT: 'Dot', TRADITIONAL: 'Traditionnelle', CUSTOM: 'Personnalisée', UNIVERSAL: 'Universelle' } as Record<string, string>)[type] ?? type}</option>)}</select></label></div>
        {filteredTemplates.length ? <div className="template-grid">{filteredTemplates.map((template) => <article className="template-card" key={template.id}><button className="template-poster" style={{ background: template.preview.background }} onClick={() => void createFromTemplate(template)} disabled={busy} aria-label={`Créer un design avec ${template.name}`}><span className="poster-frame" style={{ borderColor: template.preview.accent }}><span className="poster-ornament" style={{ color: template.preview.accent }}>✳</span><span className="poster-rule" style={{ background: template.preview.accent }} /><strong style={{ color: template.preview.style === 'MIDNIGHT_BLUE' ? '#F7F0E4' : '#302D2A' }}>{template.name}</strong><span className="poster-rule short" style={{ background: template.preview.accent }} /><small style={{ color: template.preview.accent }}>{template.category === 'WEDDING' ? 'CÉLÉBRATION' : template.category}</small></span><span className="poster-open">Ouvrir ce modèle ↗</span></button><div className="template-info"><div><span>{template.category === 'WEDDING' ? 'MARIAGE' : template.category}</span><span>VERSION {template.version}</span></div><h3>{template.name}</h3><p>{template.description}</p><div className="template-tags">{template.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><button className="template-choose" disabled={busy} onClick={() => void createFromTemplate(template)}>Personnaliser <span>→</span></button></div></article>)}</div> : <div className="design-state"><p>Aucun modèle actif dans cette catégorie. La bibliothèque se remplit à mesure que des modèles validés sont publiés.</p></div>}</section>
        <aside className="design-saved"><span className="design-kicker">VOTRE ESPACE</span><h2>Vos créations</h2>{designs.length ? <div className="saved-list">{designs.map((design) => <button key={design.id} onClick={() => void selectDesign(design)} disabled={busy}><span className="saved-palette" style={{ background: String(design.document.theme.tokens.background) }} /><span><strong>{design.name}</strong><small>Version {design.version} · Modifié {new Date(design.updatedAt).toLocaleDateString('fr-FR')}</small></span><span>→</span></button>)}</div> : <p className="saved-empty">Vos designs enregistrés apparaîtront ici.</p>}</aside></div> : <section className="editor-shell">
        <div className="editor-toolbar"><button className="editor-return" onClick={() => { if (dirty && !window.confirm('Les changements non enregistrés seront perdus. Quitter ?')) return; setSelected(null); setSavedDocument(null); setSavedName(''); setHistory([]); setFuture([]); }}>← Bibliothèque</button><div className="editor-title"><input aria-label="Nom du design" value={selected.name} onChange={(eventChange) => setSelected({ ...selected, name: eventChange.target.value })} maxLength={120} /><span>v{selected.version}{dirty ? ' · Modifications non enregistrées' : ' · Enregistré'}</span></div><div className="editor-actions"><button title="Annuler (Ctrl/⌘+Z)" disabled={!history.length || busy} onClick={undo}>↶</button><button title="Rétablir (Ctrl/⌘+Maj+Z)" disabled={!future.length || busy} onClick={redo}>↷</button><button disabled={!dirty || busy} onClick={() => void save()}>Enregistrer</button></div></div>
        <div className="editor-body"><aside className="editor-panel editor-left"><span className="design-kicker">CALQUES · {selected.document.elements.length}</span><div className="layer-list">{[...selected.document.elements].sort((a, b) => b.zIndex - a.zIndex).map((layer) => <button key={layer.id} className={activeLayerId === layer.id ? 'active' : ''} onClick={() => setActiveLayerId(layer.id)}><span className={`layer-icon ${layer.type.toLowerCase()}`}>{layer.type === 'TEXT' ? 'T' : layer.type === 'BACKGROUND' ? '◧' : '□'}</span><span><strong>{layer.name}</strong><small>{layer.type === 'TEXT' ? 'Texte' : layer.type === 'BACKGROUND' ? 'Arrière-plan' : 'Rectangle'}{layer.locked ? ' · verrouillé' : ''}</small></span>{layer.editable && !layer.locked && <i>✳</i>}</button>)}</div><div className="layer-add"><button onClick={addText} disabled={busy}>＋ Ajouter du texte</button><button onClick={addShape} disabled={busy}>＋ Ajouter un cadre</button></div></aside>
          <section className="editor-stage"><div className="stage-bar"><div className="preview-guest-picker"><span className="design-kicker">APERÇU DU MODÈLE</span><label>Prévisualiser comme un invité<input type="search" value={previewGuestSearch} onChange={(eventChange) => setPreviewGuestSearch(eventChange.target.value)} placeholder="Rechercher un invité" maxLength={160} /></label><label>Invité<select aria-label="Invité pour l’aperçu" value={previewGuest?.id ?? ''} onChange={(eventChange) => setPreviewGuest(previewGuests.find((guest) => guest.id === eventChange.target.value) ?? null)}><option value="">Valeurs du modèle</option>{previewGuest && !previewGuests.some((guest) => guest.id === previewGuest.id) && <option value={previewGuest.id}>{previewGuest.fullName}</option>}{previewGuests.map((guest) => <option value={guest.id} key={guest.id}>{guest.fullName}{guest.email ? ` · ${guest.email}` : ''}</option>)}</select></label>{previewGuestError && <small role="status">{previewGuestError}</small>}</div><div><button onClick={() => setDragMode((enabled) => !enabled)} aria-pressed={dragMode} className={dragMode ? 'selected-tool' : ''}>{dragMode ? '✥ Déplacement actif' : '↖ Sélection'}</button><button onClick={() => setZoom((value) => Math.max(0.24, value - 0.04))} aria-label="Zoom arrière">−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(0.52, value + 0.04))} aria-label="Zoom avant">＋</button></div></div><div className="stage-scroll"><div className="design-canvas" ref={stageRef} style={{ width: stageWidth, height: stageHeight, transform: `scale(${zoom / (stageWidth / 1080)})`, transformOrigin: 'top center', marginBottom: stageHeight * (zoom / (stageWidth / 1080) - 1) }}><svg viewBox={`0 0 ${canvas!.width} ${canvas!.height}`} width="100%" height="100%" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} style={{ cursor: dragMode ? 'grab' : 'default', touchAction: 'none' }}>
            {[...selected.document.elements].sort((a, b) => a.zIndex - b.zIndex).map((layer) => {
              const isActive = activeLayerId === layer.id;
              const fontScale = 1080 / canvas!.width;
              return <g key={layer.id} transform={`rotate(${layer.rotation} ${layer.x + layer.width / 2} ${layer.y + layer.height / 2})`} onPointerDown={(eventPointer) => beginDrag(eventPointer, layer)} onClick={() => setActiveLayerId(layer.id)}>
                {layer.type === 'BACKGROUND' && svgRect(layer, 1, `${layer.id}-background`)}
                {layer.type === 'SHAPE' && svgRect(layer, 1, `${layer.id}-shape`)}
                {layer.type === 'TEXT' && <><rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} fill="transparent" /><text x={layer.align === 'left' ? layer.x : layer.align === 'right' ? layer.x + layer.width : layer.x + layer.width / 2} y={layer.y + layer.height / 2} dominantBaseline="middle" textAnchor={layer.align === 'left' ? 'start' : layer.align === 'right' ? 'end' : 'middle'} fontFamily={layer.fontFamily} fontSize={layer.fontSize} fontWeight={layer.fontWeight} fill={layer.color}>{wrapText(renderText(layer.text ?? '', variableMap), Math.max(1, Math.floor(layer.width / ((layer.fontSize ?? 16) * 0.58)))).map((line, index, lines) => <tspan key={index} x={layer.align === 'left' ? layer.x : layer.align === 'right' ? layer.x + layer.width : layer.x + layer.width / 2} dy={index === 0 ? `${-((lines.length - 1) * (layer.fontSize ?? 16) * 1.2) / 2}px` : `${(layer.fontSize ?? 16) * 1.2}px`}>{line}</tspan>)}</text></>}
                {isActive && layer.type !== 'BACKGROUND' && <rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} fill="none" stroke="#ba8065" strokeWidth={4 / fontScale} strokeDasharray={`${8 / fontScale} ${6 / fontScale}`} pointerEvents="none" />}
              </g>;
            })}
          </svg></div></div><div className="stage-footnote">{canvas!.width} × {canvas!.height} px · Format {selected.document.layouts[0]?.name}</div></section>
          <aside className="editor-panel editor-right"><span className="design-kicker">PERSONNALISATION</span><h2>{openLayer?.name ?? 'Votre design'}</h2>{openLayer && <div className="layer-tools"><button disabled={openLayer.type === 'BACKGROUND'} onClick={() => moveLayerInStack(openLayer, -1)} title="Descendre le calque">↓ Arrière</button><button disabled={openLayer.type === 'BACKGROUND'} onClick={() => moveLayerInStack(openLayer, 1)} title="Monter le calque">↑ Avant</button><button disabled={openLayer.type === 'BACKGROUND'} onClick={() => toggleLayerLock(openLayer)}>{openLayer.locked ? 'Déverrouiller' : 'Verrouiller'}</button><button disabled={openLayer.locked || openLayer.type === 'BACKGROUND'} onClick={() => duplicateLayer(openLayer)}>Dupliquer</button></div>}{openLayer?.locked ? <p className="inspector-note">Ce calque est verrouillé. Vous pouvez le déverrouiller pour le modifier.</p> : openLayer?.type === 'TEXT' ? <div className="inspector-fields"><label>Nom du calque<input value={openLayer.name} maxLength={100} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.name = eventChange.target.value; })} /></label><label>Contenu<textarea value={openLayer.text ?? ''} maxLength={500} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.text = eventChange.target.value; })} /></label><label>Alignement<select value={openLayer.align} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.align = eventChange.target.value as NonNullable<Layer['align']>; })}><option value="left">À gauche</option><option value="center">Centré</option><option value="right">À droite</option></select></label><div className="inspector-pair"><label>Corps<input type="number" min="8" max="180" value={openLayer.fontSize} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.fontSize = Number(eventChange.target.value); })} /></label><label>Couleur<input type="color" value={openLayer.color} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.color = eventChange.target.value; })} /></label></div><label>Police<select value={openLayer.fontFamily} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.fontFamily = eventChange.target.value; })}><option value="Georgia">Georgia</option><option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option></select></label><div className="inspector-pair"><label>Largeur<input type="number" min="1" max={canvas!.width - openLayer.x} value={Math.round(openLayer.width)} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.width = Number(eventChange.target.value); })} /></label><label>Hauteur<input type="number" min="1" max={canvas!.height - openLayer.y} value={Math.round(openLayer.height)} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.height = Number(eventChange.target.value); })} /></label></div><div className="inspector-pair"><label>Rotation<input type="number" min="-360" max="360" value={openLayer.rotation} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.rotation = Number(eventChange.target.value); })} /></label><label>Position X<input type="number" min="0" max={canvas!.width - openLayer.width} value={Math.round(openLayer.x)} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.x = Number(eventChange.target.value); })} /></label></div><label className="position-fields">Position Y<input type="number" min="0" max={canvas!.height - openLayer.height} value={Math.round(openLayer.y)} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.y = Number(eventChange.target.value); })} /></label><button className="danger-action" onClick={() => { editDocument((document) => { document.elements = document.elements.filter((layer) => layer.id !== openLayer.id); }); setActiveLayerId(null); }}>Supprimer ce calque</button></div> : openLayer?.type === 'SHAPE' ? <div className="inspector-fields"><label>Nom du calque<input value={openLayer.name} maxLength={100} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.name = eventChange.target.value; })} /></label><div className="inspector-pair"><label>Remplissage<input type="color" value={openLayer.fill === 'transparent' ? '#ffffff' : openLayer.fill} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.fill = eventChange.target.value; })} /></label><label>Contour<input type="color" value={openLayer.stroke} onChange={(eventChange) => editDocument((document) => { const target = document.elements.find((layer) => layer.id === openLayer.id)!; target.stroke = eventChange.target.value; })} /></label></div><p className="inspector-note">Cadre rectangulaire éditable.</p><button className="danger-action" onClick={() => { editDocument((document) => { document.elements = document.elements.filter((layer) => layer.id !== openLayer.id); }); setActiveLayerId(null); }}>Supprimer ce calque</button></div> : <div className="inspector-fields"><label>Palette principale<input type="color" value={selected.document.theme.tokens.primary} onChange={(eventChange) => editDocument((document) => { document.theme.tokens.primary = eventChange.target.value; for (const layer of document.elements) if (layer.type === 'SHAPE' && layer.stroke === selected.document.theme.tokens.primary) layer.stroke = eventChange.target.value; })} /></label><label>Fond du canevas<input type="color" value={selected.document.theme.tokens.background} onChange={(eventChange) => editDocument((document) => { document.theme.tokens.background = eventChange.target.value; const background = document.elements.find((layer) => layer.type === 'BACKGROUND'); if (background) background.fill = eventChange.target.value; })} /></label><p className="inspector-note">Format portrait · {selected.document.canvas.width} × {selected.document.canvas.height} px</p></div>}
            <div className="inspector-section ai-assistant"><span className="design-kicker">ASSISTANT DE CRÉATION</span><p>Décrivez une ambiance. L’assistant propose des changements structurés et vous gardez la main avant l’enregistrement.</p><textarea value={aiPrompt} onChange={(eventChange) => setAiPrompt(eventChange.target.value)} maxLength={2000} minLength={8} placeholder="Ex. une ambiance africaine contemporaine, tons émeraude et dorés, élégante et très lisible…" disabled={aiBusy || aiJob?.status === 'QUEUED' || aiJob?.status === 'PROCESSING'} /><button className="ai-request-action" onClick={() => void requestAiProposal()} disabled={!selected || dirty || aiBusy || aiPrompt.trim().length < 8 || aiJob?.status === 'QUEUED' || aiJob?.status === 'PROCESSING'}>{aiJob?.status === 'QUEUED' || aiJob?.status === 'PROCESSING' ? 'Création en cours…' : aiBusy ? 'Envoi…' : 'Demander une proposition'}</button>{dirty && <small>Enregistrez vos modifications avant de demander une proposition.</small>}{aiJob && <div className={`ai-result ${aiJob.status.toLowerCase()}`}><strong>{aiJob.status === 'QUEUED' ? 'En attente dans la file' : aiJob.status === 'PROCESSING' ? 'Analyse du design en cours' : aiJob.status === 'PROPOSED' ? 'Proposition prête' : aiJob.status === 'CANCELLED' ? 'Demande annulée' : 'Proposition indisponible'}</strong>{aiJob.summary && <p>{aiJob.summary}</p>}{aiJob.status === 'PROPOSED' && <>{aiJob.previewAvailable && <img className="ai-preview-image" src={`/api/events/${encodeURIComponent(event.id)}/designs/${encodeURIComponent(selected.id)}/ai-jobs/${encodeURIComponent(aiJob.id)}/preview`} alt="Aperçu généré de l’arrière-plan" />}{!aiJob.previewAvailable && <small className="ai-provider-label">Aucun aperçu image en mode local simulé</small>}<small className="ai-provider-label">{aiJob.provider === 'mock' ? 'Mode local simulé · aucun modèle IA appelé' : 'Fournisseur auto-hébergé'}</small><button className="ai-apply-action" onClick={applyAiProposal} disabled={dirty || selected.version !== aiJob.baseVersion}>Appliquer cette proposition</button>{selected.version !== aiJob.baseVersion && <small>Le design a changé depuis cette demande. Lancez une nouvelle proposition.</small>}</>}{aiJob.status === 'FAILED' && <><small>{aiJob.errorCode === 'provider_unavailable' ? 'Le fournisseur auto-hébergé est indisponible ou non configuré.' : aiJob.errorCode === 'invalid_proposal' ? 'La proposition reçue ne respecte pas les règles du design.' : 'La génération n’a pas abouti.'}</small><button className="ai-apply-action" disabled={aiBusy || aiJob.attempt >= 3} onClick={() => void retryAiJob()}>{aiJob.attempt >= 3 ? 'Limite de tentatives atteinte' : 'Réessayer'}</button></>}</div>}</div>
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
