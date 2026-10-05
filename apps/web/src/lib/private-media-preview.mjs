/** Load an authenticated signed preview into a locally owned blob, accepted by the shared renderer. */
export async function loadPrivateMediaPreview(assetId) {
  const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/download-url?variant=preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Aperçu privé indisponible.');
  const payload = await response.json();
  const url = new URL(payload.download?.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('URL de média invalide.');
  const image = await fetch(url.href, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!image.ok) throw new Error('Le stockage a refusé l’aperçu.');
  const bytes = await image.blob();
  if (!['image/png', 'image/webp'].includes(bytes.type) || bytes.size > 20 * 1024 * 1024) throw new Error('Format d’aperçu invalide.');
  return URL.createObjectURL(bytes);
}
