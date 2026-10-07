'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type ModerationReport = { id: string; resourceType: string; resourceId: string; reasonCode: string; description: string; status: string; reporterSubject: string; createdAt: string };
export function ModerationQueue({ reports }: { reports: ModerationReport[] }) {
  const router = useRouter(); const [busy, setBusy] = useState(''); const [message, setMessage] = useState('');
  const decide = async (report: ModerationReport, status: 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED') => {
    const resolutionNote = status === 'IN_REVIEW' ? 'Pris en charge par le support.' : window.prompt(status === 'RESOLVED' ? 'Note de résolution (5 caractères minimum)' : 'Motif de rejet (5 caractères minimum)');
    if (!resolutionNote) return; setBusy(report.id); setMessage('');
    try { const response = await fetch(`/api/admin/moderation-reports/${encodeURIComponent(report.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status, resolutionNote }), cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.message ?? 'La décision n’a pas été enregistrée.'); setMessage('Dossier mis à jour.'); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'La décision n’a pas été enregistrée.'); } finally { setBusy(''); }
  };
  return <><div className="moderation-list">{reports.map(report => <article key={report.id}><div className="moderation-top"><span>{report.resourceType} · {report.reasonCode}</span><span className={`admin-status admin-status-${report.status.toLowerCase()}`}>{report.status}</span><time>{new Date(report.createdAt).toLocaleString('fr-FR')}</time></div><p>{report.description}</p><code>{report.resourceId}</code><small>Signalé par {report.reporterSubject}</small><div className="moderation-actions">{report.status === 'OPEN' && <button disabled={!!busy} onClick={() => void decide(report, 'IN_REVIEW')}>Prendre en charge</button>}<button disabled={!!busy} onClick={() => void decide(report, 'RESOLVED')}>Résolu</button><button className="admin-button-danger" disabled={!!busy} onClick={() => void decide(report, 'DISMISSED')}>Classer sans suite</button></div></article>)}</div>{!reports.length && <p className="admin-empty">Aucun signalement ouvert.</p>}{message && <p role="status">{message}</p>}</>;
}
