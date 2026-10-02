'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Profile = { displayName: string | null; locale: string; email: string | null };

export function ProfileForm({ profile }: { profile: Profile }) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [locale, setLocale] = useState(profile.locale);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<
    'PENDING' | 'CANCELLED' | 'COMPLETED' | null
  >(null);
  const [deletionStatusLoaded, setDeletionStatusLoaded] = useState(false);
  const [deletionStatusError, setDeletionStatusError] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);

  useEffect(() => {
    void fetch('/api/profile/deletion-request', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('deletion_status_unavailable');
        const value: unknown = await response.json();
        if (value && typeof value === 'object' && 'request' in value) {
          const deletion = (value as { request?: { status?: unknown } | null }).request;
          if (
            deletion?.status === 'PENDING' ||
            deletion?.status === 'CANCELLED' ||
            deletion?.status === 'COMPLETED'
          ) {
            setDeletionStatus(deletion.status);
          }
        }
      })
      .catch(() => {
        setDeletionStatusError(true);
        setMessage('Impossible de charger le statut de suppression du compte.');
      })
      .finally(() => setDeletionStatusLoaded(true));
    return undefined;
  }, []);

  async function changeDeletionRequest(method: 'POST' | 'DELETE') {
    if (
      method === 'POST' &&
      !window.confirm(
        'Envoyer une demande de suppression de votre compte ? La demande sera enregistrée pour traitement.',
      )
    )
      return;
    setDeletionBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/profile/deletion-request', {
        method,
        ...(method === 'POST' ? { headers: { 'content-type': 'application/json' } } : {}),
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error('request_failed');
      if (method === 'DELETE') {
        const cancelled =
          value && typeof value === 'object' && 'cancelled' in value
            ? (value as { cancelled?: unknown }).cancelled === true
            : false;
        if (cancelled) {
          setDeletionStatus('CANCELLED');
          setMessage('La demande en attente a été annulée.');
        } else {
          setDeletionStatus(null);
          setMessage('Aucune demande en attente à annuler.');
        }
      } else if (value && typeof value === 'object' && 'request' in value) {
        const deletion = (value as { request?: { status?: unknown } }).request;
        if (deletion?.status === 'PENDING' || deletion?.status === 'COMPLETED') {
          setDeletionStatus(deletion.status);
          setMessage(
            deletion.status === 'PENDING'
              ? 'Demande enregistrée. Elle est en attente de traitement.'
              : 'La suppression est déjà terminée.',
          );
        }
      }
    } catch {
      setMessage('Impossible de mettre à jour la demande. Réessayez.');
    } finally {
      setDeletionBusy(false);
    }
  }

  async function downloadProfile() {
    setMessage('');
    setExporting(true);
    try {
      const response = await fetch('/api/profile/export', { cache: 'no-store' });
      if (!response.ok) {
        setMessage(
          response.status === 401
            ? 'Votre session a expiré. Reconnectez-vous.'
            : 'Impossible de préparer l’export de vos données. Réessayez.',
        );
        return;
      }
      const filename =
        response.headers.get('content-disposition')?.match(/filename="([A-Za-z0-9._-]+)"/)?.[1] ??
        `invitaflow-profil-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage('Export du profil téléchargé.');
    } catch {
      setMessage('Service momentanément indisponible. Réessayez.');
    } finally {
      setExporting(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setSaving(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName, locale }),
      });
      if (!response.ok) {
        setMessage(
          response.status === 401
            ? 'Votre session a expiré. Reconnectez-vous.'
            : 'Impossible de sauvegarder le profil. Réessayez.',
        );
        return;
      }
      setMessage('Profil enregistré.');
    } catch {
      setMessage('Service momentanément indisponible. Réessayez.');
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/');
  }

  return (
    <>
      <form className="profile-form" onSubmit={save}>
        <label htmlFor="profile-name">Nom affiché</label>
        <input
          id="profile-name"
          value={displayName}
          maxLength={100}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
        <label htmlFor="profile-locale">Langue</label>
        <select
          id="profile-locale"
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
        <button className="save-button" type="submit" disabled={saving || exporting}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <p className="form-status" role="status" aria-live="polite">
          {message}
        </p>
      </form>
      <button
        className="logout-button"
        type="button"
        onClick={() => void downloadProfile()}
        disabled={exporting || saving}
      >
        {exporting ? 'Préparation de l’export…' : 'Télécharger mes données InvitaFlow (JSON)'}
      </button>
      <button className="logout-button" type="button" onClick={logout}>
        Se déconnecter
      </button>
      <section className="account-deletion" aria-labelledby="account-deletion-title">
        <h2 id="account-deletion-title">Suppression du compte</h2>
        {!deletionStatusLoaded ? (
          <p role="status">Chargement du statut…</p>
        ) : deletionStatusError ? (
          <p role="status">Impossible de charger le statut de suppression du compte.</p>
        ) : deletionStatus === 'PENDING' ? (
          <>
            <p>
              Une demande est enregistrée et attend son traitement. Vos données ne sont pas encore
              supprimées.
            </p>
            <button
              className="logout-button"
              type="button"
              onClick={() => void changeDeletionRequest('DELETE')}
              disabled={deletionBusy || !deletionStatusLoaded}
            >
              {deletionBusy ? 'Mise à jour…' : 'Annuler la demande'}
            </button>
          </>
        ) : deletionStatus === 'COMPLETED' ? (
          <p>La suppression du compte a été marquée comme terminée.</p>
        ) : (
          <>
            <p>
              La demande sera enregistrée pour traitement. Les données d’autres services et les
              pièces financières ne sont pas effacées immédiatement.
            </p>
            <button
              className="logout-button"
              type="button"
              onClick={() => void changeDeletionRequest('POST')}
              disabled={deletionBusy || !deletionStatusLoaded}
            >
              {deletionBusy ? 'Envoi…' : 'Demander la suppression du compte'}
            </button>
          </>
        )}
      </section>
    </>
  );
}
