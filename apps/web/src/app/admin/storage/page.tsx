import { decodeJwt } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { BrandLogo } from '@/components/brand-logo';
import '../admin.css';

export const dynamic = 'force-dynamic';
type StorageStats = {
  disk: { diskStatsAvailable: boolean; totalBytes: number | null; usedBytes: number | null; freeBytes: number | null; percentage: number | null; level: string; thresholds: { warning: number; serious: number; critical: number; emergency: number } };
  application: { totalUsedBytes: number; totalFileCount: number; breakdownByCategory: Record<string, { bytes: number; count: number }>; breakdownByEvent: unknown[] | null; breakdownByAgency: unknown[] | null; largestFiles: Array<{ id: string; originalName: string; category: string; sizeBytes: number; createdAt: string }> };
  cleanup: { deletedBytesLast24h: number; failures: number; lastRunAt: string | null; nextRunAt: string | null };
};

const bytes = (value: number | null) => value === null ? 'Indisponible' : `${(value / 1024 ** 3).toFixed(2)} Go`;
const date = (value: string | null) => value ? new Date(value).toLocaleString('fr-FR') : 'Aucune exécution enregistrée';

export default async function StorageAdminPage() {
  const store = await cookies();
  const session = await getSession(store.get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Fadmin%2Fstorage');
  let roles: string[] = [];
  try {
    const access = decodeJwt(session.accessToken)['realm_access'];
    roles = access && typeof access === 'object' && 'roles' in access && Array.isArray(access.roles) ? access.roles.filter((role): role is string => typeof role === 'string') : [];
  } catch { /* API verifies the signed token again. */ }
  if (!roles.some((role) => role === 'SUPER_ADMIN' || role === 'SUPPORT_ADMIN')) return <main className="admin-shell"><a href="/admin">← Administration</a><section className="admin-denied"><span>ACCÈS RESTREINT</span><h1>Permission d’administration requise</h1><p>Le stockage est réservé aux rôles Support Admin et Super Admin.</p></section></main>;

  let data: StorageStats | null = null;
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/admin/storage`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (response.ok) data = await response.json() as StorageStats;
  } catch { /* Show an unavailable state without inventing metrics. */ }

  const categories = [
    ['Originaux', 'originals'], ['PNG dérivés', 'derived'], ['Previews', 'previews'], ['PDF finaux', 'pdfFinal'], ['ZIP', 'zip'], ['Temporaires', 'temp'],
  ] as const;
  return <main className="admin-shell">
    <nav><BrandLogo variant="compact" /><a href="/admin">← Administration</a><a href="/account">Mon compte</a></nav>
    <header><span>INVITAFLOW · STOCKAGE</span><h1>Capacité et fichiers</h1><p>Les chiffres applicatifs viennent des assets Media prêts. L’espace disque est lu sur le volume MinIO lorsqu’il est monté et accessible.</p></header>
    {!data ? <section className="admin-panel"><h2>Mesures indisponibles</h2><p>Le service Media n’a pas répondu. Aucune valeur n’est simulée.</p></section> : <>
      <section className="admin-panel"><div className="admin-panel-head"><div><small>VOLUME MINIO</small><h2>{data.disk.diskStatsAvailable ? `${bytes(data.disk.usedBytes)} / ${bytes(data.disk.totalBytes)}` : 'Mesure disque indisponible'}</h2></div><span>{data.disk.percentage === null ? '—' : `${data.disk.percentage.toFixed(1)} % · ${data.disk.level}`}</span></div><p>{data.disk.diskStatsAvailable ? `${bytes(data.disk.freeBytes)} libres` : 'Le chemin du volume n’est pas monté ou statfs est indisponible.'}</p><p>Seuils : warning {data.disk.thresholds.warning} %, sérieux {data.disk.thresholds.serious} %, critique {data.disk.thresholds.critical} %, urgence {data.disk.thresholds.emergency} %.</p></section>
      <section className="admin-panel" style={{ marginTop: 18 }}><div className="admin-panel-head"><div><small>STOCKAGE APPLICATIF · MEDIA</small><h2>{bytes(data.application.totalUsedBytes)}</h2></div><span>{data.application.totalFileCount} fichier(s)</span></div><div className="admin-table-wrap"><table><thead><tr><th>Catégorie</th><th>Volume</th><th>Fichiers</th></tr></thead><tbody>{categories.map(([label, key]) => <tr key={key}><td>{label}</td><td>{bytes(data.application.breakdownByCategory[key]?.bytes ?? 0)}</td><td>{data.application.breakdownByCategory[key]?.count ?? 0}</td></tr>)}</tbody></table></div><p>PDF/ZIP et rattachements événement/agence ne sont pas encore consolidés dans le service Media.</p></section>
      <section className="admin-panel" style={{ marginTop: 18 }}><div className="admin-panel-head"><div><small>NETTOYAGE</small><h2>{bytes(data.cleanup.deletedBytesLast24h)} supprimés sur 24 h</h2></div><span>{data.cleanup.failures} échec(s) depuis le démarrage</span></div><p>Dernière exécution : {date(data.cleanup.lastRunAt)} · prochaine : {date(data.cleanup.nextRunAt)}</p></section>
      <section className="admin-panel" style={{ marginTop: 18 }}><div className="admin-panel-head"><div><small>FICHIERS</small><h2>Les plus volumineux</h2></div></div>{data.application.largestFiles.length ? <div className="admin-table-wrap"><table><thead><tr><th>Nom</th><th>Catégorie</th><th>Taille</th><th>Créé</th></tr></thead><tbody>{data.application.largestFiles.map((file) => <tr key={file.id}><td>{file.originalName}</td><td>{file.category}</td><td>{bytes(file.sizeBytes)}</td><td>{new Date(file.createdAt).toLocaleDateString('fr-FR')}</td></tr>)}</tbody></table></div> : <p className="admin-empty">Aucun fichier prêt.</p>}</section>
    </>}
  </main>;
}
