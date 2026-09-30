'use client';

import { useState, type FormEvent } from 'react';

export type Pack = { id: string; key: string; name: string; credits: number; priceMinor: number; currency: string };
export type Rule = { operation: string; creditCost: number; unit: string };
export type Catalog = { version: number; effectiveAt: string; packs: Pack[]; rules: Rule[] };

export function PriceScheduleForm({ catalog }: { catalog: Catalog }) {
  const [packs, setPacks] = useState(catalog.packs.map(({ id: _id, ...pack }) => pack));
  const [rules, setRules] = useState(catalog.rules);
  const [effectiveAt, setEffectiveAt] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setError(''); setSaving(true);
    try {
      const response = await fetch('/api/billing/admin/price-schedules', {
        method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ effectiveAt: new Date(effectiveAt).toISOString(), packs, rules }),
      });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = result && typeof result === 'object' && 'message' in result ? (result as { message: unknown }).message : null;
        throw new Error(typeof detail === 'string' ? detail : 'La nouvelle grille n’a pas été publiée.');
      }
      const version = result && typeof result === 'object' && 'version' in result ? (result as { version: number }).version : catalog.version + 1;
      setMessage(`La version ${version} est publiée et prendra effet le ${new Date(effectiveAt).toLocaleString('fr-FR')}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Le service Billing est indisponible.'); }
    finally { setSaving(false); }
  }

  return <form className="price-schedule-form" onSubmit={publish}>
    <section><div className="pricing-section-title"><div><span>PACKS DE CRÉDITS</span><h2>Prix client</h2></div><button type="button" onClick={() => setPacks([...packs, { key: `nouveau-pack-${packs.length + 1}`, name: '', credits: 0, priceMinor: 0, currency: 'USD' }])}>＋ Ajouter un pack</button></div>
      <div className="price-pack-list">{packs.map((pack, index) => <article key={`${pack.key}-${index}`}><label>Clé<input required pattern="[a-z][a-z0-9-]{1,59}" value={pack.key} onChange={(event) => setPacks(packs.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} /></label><label>Nom<input required maxLength={100} value={pack.name} onChange={(event) => setPacks(packs.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label><label>Crédits<input required type="number" min="1" max="1000000000" value={pack.credits || ''} onChange={(event) => setPacks(packs.map((item, i) => i === index ? { ...item, credits: Number(event.target.value) } : item))} /></label><label>Prix en centimes<input required type="number" min="1" max="1000000000" value={pack.priceMinor || ''} onChange={(event) => setPacks(packs.map((item, i) => i === index ? { ...item, priceMinor: Number(event.target.value) } : item))} /></label><label>Devise<input required minLength={3} maxLength={3} pattern="[A-Z]{3}" value={pack.currency} onChange={(event) => setPacks(packs.map((item, i) => i === index ? { ...item, currency: event.target.value.toUpperCase() } : item))} /></label><button type="button" className="remove-pack" aria-label={`Supprimer ${pack.name || pack.key}`} onClick={() => setPacks(packs.filter((_, i) => i !== index))}>Retirer</button></article>)}</div>
    </section>
    <section><div className="pricing-section-title"><div><span>RÈGLES D’OPÉRATION</span><h2>Coût en crédits</h2></div><button type="button" onClick={() => setRules([...rules, { operation: '', creditCost: 0, unit: 'unité' }])}>＋ Ajouter une règle</button></div>
      <div className="price-rule-list">{rules.map((rule, index) => <article key={`${rule.operation}-${index}`}><label>Opération<input required pattern="[a-z][a-z0-9._-]{1,119}" value={rule.operation} onChange={(event) => setRules(rules.map((item, i) => i === index ? { ...item, operation: event.target.value } : item))} /></label><label>Crédits par unité<input required type="number" min="0" max="1000000000" value={rule.creditCost} onChange={(event) => setRules(rules.map((item, i) => i === index ? { ...item, creditCost: Number(event.target.value) } : item))} /></label><label>Unité<input required maxLength={60} value={rule.unit} onChange={(event) => setRules(rules.map((item, i) => i === index ? { ...item, unit: event.target.value } : item))} /></label><button type="button" className="remove-pack" aria-label={`Supprimer la règle ${rule.operation || 'nouvelle'}`} disabled={rule.operation === 'invitation.preview' || rule.operation === 'invitation.test'} onClick={() => setRules(rules.filter((_, i) => i !== index))}>Retirer</button></article>)}</div><p className="pricing-hint">Les opérations invitation.preview et invitation.test doivent rester gratuites.</p>
    </section>
    <section className="pricing-effective"><label>Date de prise d’effet<input type="datetime-local" required value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} /></label><p>La nouvelle version est ajoutée sans modifier les tarifs déjà publiés. La date doit suivre la dernière grille planifiée.</p></section>
    {message && <p className="pricing-success" role="status">{message}</p>}{error && <p className="pricing-error" role="alert">{error}</p>}<button className="publish-pricing" type="submit" disabled={saving || packs.length < 1 || rules.length < 1}>{saving ? 'Publication…' : 'Publier une nouvelle version'}</button>
  </form>;
}
