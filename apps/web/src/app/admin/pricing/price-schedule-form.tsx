'use client';

import { useState, type FormEvent } from 'react';

export type Pack = {
  id: string;
  key: string;
  name: string;
  credits: number;
  periodDays: number | null;
  priceMinor: number;
  currency: string;
  description: string;
  segment: 'INDIVIDUAL' | 'AGENCY' | 'ALL';
  displayOrder: number;
  badge: string | null;
  validFrom: string | null;
  validUntil: string | null;
  visible: boolean;
};
export type Rule = { operation: string; creditCost: number; unit: string };
export type Catalog = {
  version: number;
  effectiveAt: string;
  changeReason: string;
  taxPolicy: { enabled: boolean; ruleCode: string | null; rateBps: number };
  packs: Pack[];
  rules: Rule[];
};

type EditablePack = Omit<Pack, 'id' | 'validFrom' | 'validUntil'> & {
  validFrom: string;
  validUntil: string;
};

function dateInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function editablePack(pack: Pack): EditablePack {
  return {
    key: pack.key,
    name: pack.name,
    credits: pack.credits,
    periodDays: pack.segment === 'AGENCY' ? 30 : pack.periodDays,
    priceMinor: pack.priceMinor,
    currency: pack.currency,
    description: pack.description,
    segment: pack.segment,
    displayOrder: pack.displayOrder,
    badge: pack.badge,
    validFrom: dateInput(pack.validFrom),
    validUntil: dateInput(pack.validUntil),
    visible: pack.visible,
  };
}

export function PriceScheduleForm({ catalog }: { catalog: Catalog }) {
  const [packs, setPacks] = useState<EditablePack[]>(catalog.packs.map(editablePack));
  const [rules, setRules] = useState(catalog.rules);
  const [effectiveAt, setEffectiveAt] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [taxEnabled, setTaxEnabled] = useState(catalog.taxPolicy.enabled);
  const [taxRuleCode, setTaxRuleCode] = useState(catalog.taxPolicy.ruleCode ?? '');
  const [taxRateBps, setTaxRateBps] = useState(catalog.taxPolicy.rateBps);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function updatePack(index: number, change: Partial<EditablePack>) {
    setPacks((current) => current.map((pack, i) => (i === index ? { ...pack, ...change } : pack)));
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(''); setError(''); setSaving(true);
    try {
      const response = await fetch('/api/billing/admin/price-schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          effectiveAt: new Date(effectiveAt).toISOString(),
          changeReason,
          taxPolicy: taxEnabled
            ? { enabled: true, ruleCode: taxRuleCode, rateBps: taxRateBps }
            : { enabled: false, ruleCode: null, rateBps: 0 },
          packs: packs.map((pack) => ({
            ...pack,
            periodDays: pack.segment === 'AGENCY' ? 30 : pack.periodDays,
            validFrom: pack.validFrom ? new Date(pack.validFrom).toISOString() : null,
            validUntil: pack.validUntil ? new Date(pack.validUntil).toISOString() : null,
          })),
          rules,
        }),
      });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = result && typeof result === 'object' && 'message' in result
          ? (result as { message: unknown }).message
          : null;
        throw new Error(typeof detail === 'string' ? detail : 'La nouvelle grille n’a pas été publiée.');
      }
      const version = result && typeof result === 'object' && 'version' in result
        ? (result as { version: number }).version
        : catalog.version + 1;
      setMessage(`La version ${version} est publiée et prendra effet le ${new Date(effectiveAt).toLocaleString('fr-FR')}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Le service Billing est indisponible.');
    } finally {
      setSaving(false);
    }
  }

  return <form className="price-schedule-form" onSubmit={publish}>
    <section>
      <div className="pricing-section-title"><div><span>PACKS DE CRÉDITS</span><h2>Prix client</h2></div>
        <button type="button" onClick={() => setPacks((current) => [...current, {
          key: `nouveau-pack-${current.length + 1}`, name: '', credits: 0, priceMinor: 0, currency: 'USD',
          description: '', segment: 'INDIVIDUAL', periodDays: null, displayOrder: (current.length + 1) * 10,
          badge: null, validFrom: '', validUntil: '', visible: true,
        }])}>＋ Ajouter un pack</button>
      </div>
      <div className="price-pack-list">{packs.map((pack, index) => <article key={`${pack.key}-${index}`}>
        <label>Clé<input required pattern="[a-z][a-z0-9-]{1,59}" value={pack.key} onChange={(event) => updatePack(index, { key: event.target.value })} /></label>
        <label>Nom<input required maxLength={100} value={pack.name} onChange={(event) => updatePack(index, { name: event.target.value })} /></label>
        <label>Description<input maxLength={1000} value={pack.description} onChange={(event) => updatePack(index, { description: event.target.value })} /></label>
        <label>Segment<select value={pack.segment} onChange={(event) => { const segment = event.target.value as EditablePack['segment']; updatePack(index, { segment, ...(segment === 'AGENCY' ? { periodDays: 30 } : {}) }); }}><option value="INDIVIDUAL">Particulier</option><option value="AGENCY">Agence</option><option value="ALL">Tous</option></select></label>
        <label>Crédits<input required type="number" min="1" max="1000000000" value={pack.credits || ''} onChange={(event) => updatePack(index, { credits: Number(event.target.value) })} /></label>
        {pack.segment === 'AGENCY' && <p>Durée fixe : <strong>30 jours</strong> à compter de l’activation après paiement.</p>}
        <label>Prix en centimes<input required type="number" min="1" max="1000000000" value={pack.priceMinor || ''} onChange={(event) => updatePack(index, { priceMinor: Number(event.target.value) })} /></label>
        <label>Devise<input required minLength={3} maxLength={3} pattern="[A-Z]{3}" value={pack.currency} onChange={(event) => updatePack(index, { currency: event.target.value.toUpperCase() })} /></label>
        <label>Ordre<input required type="number" min="0" max="1000000000" value={pack.displayOrder} onChange={(event) => updatePack(index, { displayOrder: Number(event.target.value) })} /></label>
        <label>Badge<input maxLength={40} value={pack.badge ?? ''} onChange={(event) => updatePack(index, { badge: event.target.value || null })} /></label>
        <label>Valide à partir de<input type="datetime-local" value={pack.validFrom} onChange={(event) => updatePack(index, { validFrom: event.target.value })} /></label>
        <label>Valide jusqu’au<input type="datetime-local" value={pack.validUntil} onChange={(event) => updatePack(index, { validUntil: event.target.value })} /></label>
        <label className="pricing-visible"><input type="checkbox" checked={pack.visible} onChange={(event) => updatePack(index, { visible: event.target.checked })} />Visible à la vente</label>
        <button type="button" className="remove-pack" aria-label={`Archiver ${pack.name || pack.key}`} onClick={() => updatePack(index, { visible: false })} disabled={!pack.visible}>Archiver dans cette version</button>
      </article>)}</div>
      <p className="pricing-hint">Une archive ou exclusion ne modifie pas les versions déjà publiées ni les commandes existantes.</p>
    </section>
    <section>
      <div className="pricing-section-title"><div><span>RÈGLES D’OPÉRATION</span><h2>Coût en crédits</h2></div><button type="button" onClick={() => setRules([...rules, { operation: '', creditCost: 0, unit: 'unité' }])}>＋ Ajouter une règle</button></div>
      <div className="price-rule-list">{rules.map((rule, index) => <article key={`${rule.operation}-${index}`}>
        <label>Opération<input required pattern="[a-z][a-z0-9._-]{1,119}" value={rule.operation} disabled={['invitation.preview', 'invitation.test', 'invitation.final.personalized'].includes(rule.operation)} onChange={(event) => setRules(rules.map((item, i) => i === index ? { ...item, operation: event.target.value } : item))} /></label>
        <label>Crédits par unité<input required type="number" min="0" max="1000000000" value={rule.creditCost} disabled={rule.operation === 'invitation.final.personalized' || rule.operation === 'invitation.preview' || rule.operation === 'invitation.test'} onChange={(event) => setRules(rules.map((item, i) => i === index ? { ...item, creditCost: Number(event.target.value) } : item))} /></label>
        <label>Unité<input required maxLength={60} value={rule.unit} onChange={(event) => setRules(rules.map((item, i) => i === index ? { ...item, unit: event.target.value } : item))} /></label>
        <button type="button" className="remove-pack" aria-label={`Supprimer la règle ${rule.operation || 'nouvelle'}`} disabled={['invitation.preview', 'invitation.test', 'invitation.final.personalized'].includes(rule.operation)} onClick={() => setRules(rules.filter((_, i) => i !== index))}>Retirer</button>
      </article>)}</div>
      <p className="pricing-hint">Les prévisualisations et tests restent gratuits. Chaque invitation finale personnalisée coûte exactement un crédit.</p>
    </section>
    <section className="pricing-effective">
      <h2>Taxe de vente</h2>
      <label className="pricing-visible"><input type="checkbox" checked={taxEnabled} onChange={(event) => setTaxEnabled(event.target.checked)} />Appliquer la règle configurée</label>
      {taxEnabled && <div className="price-rule-list"><label>Code de règle validé<input required maxLength={80} value={taxRuleCode} onChange={(event) => setTaxRuleCode(event.target.value)} /></label><label>Taux en points de base<input required type="number" min="1" max="10000" value={taxRateBps || ''} onChange={(event) => setTaxRateBps(Number(event.target.value))} /></label></div>}
      <p className="pricing-hint">Aucun taux n’est prérempli. Billing refusera l’activation tant que le déploiement n’a pas approuvé la règle officielle; laissez cette option désactivée en attendant la validation fiscale.</p>
    </section>
    <section className="pricing-effective">
      <label>Date de prise d’effet<input type="datetime-local" required value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} /></label>
      <label>Motif obligatoire<input required minLength={10} maxLength={500} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} placeholder="Ex. Ajustement de la grille commerciale" /></label>
      <p>La nouvelle version est ajoutée sans modifier les tarifs déjà publiés. La date doit suivre la dernière grille planifiée.</p>
    </section>
    {message && <p className="pricing-success" role="status">{message}</p>}{error && <p className="pricing-error" role="alert">{error}</p>}
    <button className="publish-pricing" type="submit" disabled={saving || !packs.some((pack) => pack.visible) || rules.length < 1}>{saving ? 'Publication…' : 'Publier une nouvelle version'}</button>
  </form>;
}
