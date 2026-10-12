'use client';
import type { ChangeEvent } from 'react';
import type { Ceremony } from '@/app/events/types';
export default function MomentFields({ initial, timezone, start, end = '', onStart, onEnd, onInvalidEnd }: {
  initial?: Ceremony; timezone: string; start: string; end?: string;
  onStart: (e: ChangeEvent<HTMLInputElement>) => void; onEnd: (e: ChangeEvent<HTMLInputElement>) => void;
  onInvalidEnd: (e: React.InvalidEvent<HTMLInputElement>) => void;
}) {
  return <>
    <input type="hidden" name="operationId" defaultValue="" />
    <label>Nom du moment<input name="name" defaultValue={initial?.name ?? ''} placeholder="Ex. réception / soirée" minLength={2} maxLength={120} required /></label>
    <label>Date et heure de début<input name="startAt" aria-label="Date et heure de début" type="datetime-local" defaultValue={start} onChange={onStart} required /></label>
    <label>Lieu<input name="location" defaultValue={initial?.location ?? ''} placeholder="Nom du lieu" maxLength={300} /></label>
    <label>Adresse ou informations complémentaires (facultatif)<input name="address" defaultValue={initial?.address ?? ''} maxLength={500} /></label>
    <details><summary>Réglages complémentaires (facultatif)</summary>
      <label>Type de moment<select name="ceremonyType" defaultValue={initial?.ceremonyType ?? 'OTHER'}><option value="CIVIL">Mariage civil</option><option value="RELIGIOUS">Cérémonie religieuse</option><option value="RECEPTION">Réception / soirée</option><option value="DOT">Dot</option><option value="TRADITIONAL">Traditionnelle</option><option value="OTHER">Autre moment</option></select></label>
      <label>Heure de fin (facultatif)<input name="endAt" type="datetime-local" defaultValue={end} min={start || undefined} onChange={onEnd} onInvalid={onInvalidEnd} /></label>
      <label>Fuseau horaire<select name="timezone" defaultValue={timezone}><option value="Africa/Kinshasa">Kinshasa</option><option value="Europe/Paris">Paris</option><option value="UTC">UTC</option></select></label>
      <label>Tenue<input name="dressCode" defaultValue={initial?.dressCode ?? ''} maxLength={200} /></label>
      <label>Capacité<input name="capacity" type="number" min={1} max={100000} defaultValue={initial?.capacity ?? ''} /></label>
      <label>Latitude<input name="latitude" type="number" step="any" defaultValue={initial?.latitude ?? ''} /></label><label>Longitude<input name="longitude" type="number" step="any" defaultValue={initial?.longitude ?? ''} /></label>
      <label>Description<textarea name="description" defaultValue={initial?.description ?? ''} maxLength={2000} /></label><label>Instructions<textarea name="instructions" defaultValue={initial?.instructions ?? ''} maxLength={4000} /></label><label>Notes<textarea name="notes" defaultValue={initial?.notes ?? ''} maxLength={2000} /></label>
    </details>
  </>;
}
