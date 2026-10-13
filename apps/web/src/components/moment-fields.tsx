'use client';
import { useId, type ChangeEvent } from 'react';
import type { Ceremony } from '@/app/events/types';
export default function MomentFields({ initial, timezone, start, end = '', errors = {}, onStart, onEnd, onInvalidEnd }: {
  initial?: Ceremony; errors?: Record<string, string>; timezone: string; start: string; end?: string;
  onStart: (e: ChangeEvent<HTMLInputElement>) => void; onEnd: (e: ChangeEvent<HTMLInputElement>) => void;
  onInvalidEnd: (e: React.InvalidEvent<HTMLInputElement>) => void;
}) {
  const prefix = useId();
  const error = (name: string) => errors[name] ? <small id={`${prefix}-${name}`} role="alert">{errors[name]}</small> : null;
  return <>
    <input type="hidden" name="operationId" defaultValue="" />
    <label>Nom du moment<input name="name" aria-invalid={Boolean(errors['name'])} aria-describedby={errors['name'] ? `${prefix}-name` : undefined} defaultValue={initial?.name ?? ''} placeholder="Ex. réception / soirée" minLength={2} maxLength={120} required />{error('name')}</label>
    <label>Date et heure de début<input name="startAt" aria-invalid={Boolean(errors['startAt'])} aria-describedby={errors['startAt'] ? `${prefix}-startAt` : undefined} aria-label="Date et heure de début" type="datetime-local" defaultValue={start} onChange={onStart} required />{error('startAt')}</label>
    <label>Lieu<input name="location" aria-invalid={Boolean(errors['location'])} aria-describedby={errors['location'] ? `${prefix}-location` : undefined} defaultValue={initial?.location ?? ''} placeholder="Nom du lieu" maxLength={300} />{error('location')}</label>
    <label>Adresse ou informations complémentaires (facultatif)<input name="address" aria-invalid={Boolean(errors['address'])} aria-describedby={errors['address'] ? `${prefix}-address` : undefined} defaultValue={initial?.address ?? ''} maxLength={500} />{error('address')}</label>
    <details><summary>Réglages complémentaires (facultatif)</summary>
      <label>Type de moment<select name="ceremonyType" aria-invalid={Boolean(errors['ceremonyType'])} aria-describedby={errors['ceremonyType'] ? `${prefix}-ceremonyType` : undefined} defaultValue={initial?.ceremonyType ?? 'OTHER'}><option value="CIVIL">Mariage civil</option><option value="RELIGIOUS">Cérémonie religieuse</option><option value="RECEPTION">Réception / soirée</option><option value="DOT">Dot</option><option value="TRADITIONAL">Traditionnelle</option><option value="OTHER">Autre moment</option></select>{error('ceremonyType')}</label>
      <label>Heure de fin (facultatif)<input name="endAt" aria-invalid={Boolean(errors['endAt'])} aria-describedby={errors['endAt'] ? `${prefix}-endAt` : undefined} type="datetime-local" defaultValue={end} min={start || undefined} onChange={onEnd} onInvalid={onInvalidEnd} />{error('endAt')}</label>
      <label>Fuseau horaire<select name="timezone" aria-invalid={Boolean(errors['timezone'])} aria-describedby={errors['timezone'] ? `${prefix}-timezone` : undefined} defaultValue={timezone}><option value="Africa/Kinshasa">Kinshasa</option><option value="Europe/Paris">Paris</option><option value="UTC">UTC</option></select>{error('timezone')}</label>
      <label>Tenue<input name="dressCode" aria-invalid={Boolean(errors['dressCode'])} aria-describedby={errors['dressCode'] ? `${prefix}-dressCode` : undefined} defaultValue={initial?.dressCode ?? ''} maxLength={200} />{error('dressCode')}</label>
      <label>Capacité<input name="capacity" aria-invalid={Boolean(errors['capacity'])} aria-describedby={errors['capacity'] ? `${prefix}-capacity` : undefined} type="number" min={1} max={100000} defaultValue={initial?.capacity ?? ''} />{error('capacity')}</label>
      <label>Latitude<input name="latitude" aria-invalid={Boolean(errors['latitude'])} aria-describedby={errors['latitude'] ? `${prefix}-latitude` : undefined} type="number" step="any" defaultValue={initial?.latitude ?? ''} />{error('latitude')}</label><label>Longitude<input name="longitude" aria-invalid={Boolean(errors['longitude'])} aria-describedby={errors['longitude'] ? `${prefix}-longitude` : undefined} type="number" step="any" defaultValue={initial?.longitude ?? ''} />{error('longitude')}</label>
      <label>Description<textarea name="description" aria-invalid={Boolean(errors['description'])} aria-describedby={errors['description'] ? `${prefix}-description` : undefined} defaultValue={initial?.description ?? ''} maxLength={2000} />{error('description')}</label><label>Instructions<textarea name="instructions" aria-invalid={Boolean(errors['instructions'])} aria-describedby={errors['instructions'] ? `${prefix}-instructions` : undefined} defaultValue={initial?.instructions ?? ''} maxLength={4000} />{error('instructions')}</label><label>Notes<textarea name="notes" aria-invalid={Boolean(errors['notes'])} aria-describedby={errors['notes'] ? `${prefix}-notes` : undefined} defaultValue={initial?.notes ?? ''} maxLength={2000} />{error('notes')}</label>
    </details>
  </>;
}
