'use client';

import { useCallback, useEffect, useState } from 'react';

type Ceremony = { id: string; name: string; startAt?: string };
type Link = { id: string; label: string | null; reference: string; status: 'ACTIVE' | 'EXPIRED' | 'REVOKED'; createdAt: string; expiresAt: string; lastUsedAt: string | null; ceremonies: { ceremonyId: string; ceremonyName: string; startAt: string; expiresAt: string }[] };

export function CheckInLinkManager({ eventId, ceremonies }: { eventId: string; ceremonies: Ceremony[] }) {
  const [items, setItems] = useState<Link[]>([]);
  const [label, setLabel] = useState('');
  const [scope, setScope] = useState<string[]>(ceremonies.map((ceremony) => ceremony.id));
  const [allCeremonies, setAllCeremonies] = useState(true);
  const [createdUrl, setCreatedUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/check-in-links`, { cache: 'no-store' });
    if (response.ok) setItems((await response.json()).items ?? []);
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);
  const create = async () => {
    setError(''); setCreatedUrl(''); setBusy(true);
    try {
      if (!allCeremonies && !scope.length) throw new Error('Sélectionnez au moins un moment.');
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/check-in-links`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(label.trim() ? { label: label.trim() } : {}), ...(!allCeremonies ? { ceremonyIds: scope } : {}) }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? 'La création du lien a échoué.');
      const url = `${window.location.origin}/pointage/${result.token}`;
      setCreatedUrl(url); setLabel(''); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'La création du lien a échoué.'); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    setError('');
    const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/check-in-links/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) { const result = await response.json().catch(() => null); setError(result?.message ?? 'La révocation a échoué.'); return; }
    await load();
  };
  const share = async () => {
    if (!createdUrl) return;
    try { if (navigator.share) await navigator.share({ title: 'Lien de pointage InvitaFlow', url: createdUrl }); else await navigator.clipboard.writeText(createdUrl); } catch { /* User cancelled sharing. */ }
  };
  return <section className="check-card agent-manager"><p className="check-eyebrow">POINTAGE MOBILE SÉCURISÉ</p><h2>Liens d’accueil sans compte</h2><p>Chaque lien est limité aux moments choisis et expire automatiquement après la période de pointage.</p><label>Repère interne (facultatif)<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} placeholder="Ex. Table d’accueil" /></label>{ceremonies.length > 0 ? <><label className="agent-check"><input type="checkbox" checked={allCeremonies} onChange={(event) => setAllCeremonies(event.target.checked)} />Tous les moments de cet événement</label>{!allCeremonies && <fieldset><legend>Moments autorisés</legend>{ceremonies.map((ceremony) => <label className="agent-check" key={ceremony.id}><input type="checkbox" checked={scope.includes(ceremony.id)} onChange={(event) => setScope((current) => event.target.checked ? [...current, ceremony.id] : current.filter((id) => id !== ceremony.id))} />{ceremony.name}</label>)}</fieldset>}</> : <p className="check-info">Périmètre : Accès global à l’événement (aucune cérémonie distincte).</p>}<button className="check-primary" disabled={busy} onClick={() => void create()}>{busy ? 'Création…' : 'Créer un lien de pointage'}</button>{createdUrl && <div className="check-result accepted"><strong>Lien créé — copiez-le maintenant</strong><input readOnly value={createdUrl} aria-label="Lien de pointage créé" onFocus={(event) => event.currentTarget.select()} /><div><button className="check-secondary" onClick={() => void navigator.clipboard.writeText(createdUrl)}>Copier</button><button className="check-secondary" onClick={() => void share()}>Partager</button><a className="check-secondary" href={`https://wa.me/?text=${encodeURIComponent(`Voici le lien de pointage : ${createdUrl}`)}`} target="_blank" rel="noreferrer">WhatsApp</a></div></div>}{error && <p className="check-message" role="alert">{error}</p>}<div className="check-recent">{items.map((link) => <article key={link.id}><strong>{link.reference}</strong><span>{link.status === 'ACTIVE' ? `Actif jusqu’au ${new Date(link.expiresAt).toLocaleString('fr-FR')}` : link.status === 'EXPIRED' ? 'Expiré' : 'Révoqué'} · {link.ceremonies.length} moment(s)</span>{link.lastUsedAt && <span>Dernière utilisation : {new Date(link.lastUsedAt).toLocaleString('fr-FR')}</span>}{link.status === 'ACTIVE' && <button className="check-secondary" onClick={() => void revoke(link.id)}>Révoquer</button>}</article>)}</div></section>;
}
