'use client';

import { useState, type FormEvent } from 'react';

type Profile = { displayName: string | null; locale: string; email: string | null };

export function ProfileForm({ profile }: { profile: Profile }) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [locale, setLocale] = useState(profile.locale);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  function downloadProfile() {
    const exportedAt = new Date().toISOString();
    const contents = JSON.stringify({
      format: 'invitaflow-profile-export-v1',
      exportedAt,
      scope: 'profile',
      profile: { email: profile.email, displayName, locale },
    }, null, 2);
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `invitaflow-profil-${exportedAt.slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
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
        setMessage(response.status === 401 ? 'Votre session a expiré. Reconnectez-vous.' : 'Impossible de sauvegarder le profil. Réessayez.');
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
        <input id="profile-name" value={displayName} maxLength={100} onChange={(event) => setDisplayName(event.target.value)} required />
        <label htmlFor="profile-locale">Langue</label>
        <select id="profile-locale" value={locale} onChange={(event) => setLocale(event.target.value)}>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
        <button className="save-button" type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        <p className="form-status" role="status" aria-live="polite">{message}</p>
      </form>
      <button className="logout-button" type="button" onClick={downloadProfile}>Télécharger mes données de profil (JSON)</button>
      <button className="logout-button" type="button" onClick={logout}>Se déconnecter</button>
    </>
  );
}
