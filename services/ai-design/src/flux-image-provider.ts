import { ServiceUnavailableException } from '@nestjs/common';
import { isPng } from './preview-storage.js';

export type FluxTask = { id: string; pollingUrl: string };
export interface ImageGenerationProvider {
  submit(prompt: string): Promise<FluxTask>;
  result(task: FluxTask): Promise<Buffer>;
}
function apiUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !(url.hostname === 'api.bfl.ai' || url.hostname.endsWith('.bfl.ai')) || url.username || url.password || url.port || url.hash) throw new ServiceUnavailableException('Réponse FLUX invalide.');
  return url;
}
export class FluxImageProvider implements ImageGenerationProvider {
  private headers() {
    const key = process.env['BFL_API_KEY'];
    if (!key) throw new ServiceUnavailableException('FLUX n’est pas configuré. Les modèles existants restent disponibles.');
    return { 'x-key': key, 'content-type': 'application/json' };
  }
  async submit(prompt: string): Promise<FluxTask> {
    const model = process.env['FLUX_MODEL'] || 'flux-2-klein-9b';
    if (!/^flux-2-klein-9b(?:-preview)?$/.test(model)) throw new ServiceUnavailableException('Modèle FLUX non pris en charge.');
    const headers = this.headers();
    let response: Response;
    try { response = await fetch(`https://api.bfl.ai/v1/${model}`, { method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(30_000), body: JSON.stringify({ prompt: `Portrait invitation decoration. ${prompt}. Cream paper, restrained botanical ornaments and gold detail. Large clear central area. No text, letters, numbers, names, people, QR codes or logos.`, width: 768, height: 1024, output_format: 'png', safety_tolerance: 2 }) }); }
    catch { throw new ServiceUnavailableException('Envoi FLUX incertain. Ne relancez pas automatiquement cette génération.'); }
    if (!response.ok) throw new ServiceUnavailableException('FLUX est momentanément indisponible.');
    const payload = await response.json() as { id?: unknown; polling_url?: unknown };
    if (typeof payload.id !== 'string' || typeof payload.polling_url !== 'string') throw new ServiceUnavailableException('Réponse FLUX invalide.');
    return { id: payload.id, pollingUrl: apiUrl(payload.polling_url).href };
  }
  async result(task: FluxTask) {
    const started = Date.now();
    while (Date.now() - started < 120_000) {
      const response = await fetch(apiUrl(task.pollingUrl), { headers: this.headers(), signal: AbortSignal.timeout(10_000), redirect: 'error' });
      if (!response.ok) throw new ServiceUnavailableException('Suivi FLUX indisponible.');
      const state = await response.json() as { status?: string; result?: { sample?: unknown } };
      if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(state.status ?? '')) throw new ServiceUnavailableException('Le visuel FLUX n’a pas pu être produit.');
      if (state.status === 'Ready') {
        if (typeof state.result?.sample !== 'string') throw new ServiceUnavailableException('Visuel FLUX absent.');
        const sample = new URL(state.result.sample);
        const allowed = (process.env['FLUX_RESULT_HOSTS'] || 'delivery-eu1.bfl.ai,delivery-us1.bfl.ai').split(',').map(value => value.trim());
        if (sample.protocol !== 'https:' || !allowed.includes(sample.hostname) || sample.username || sample.password || sample.port) throw new ServiceUnavailableException('Origine du visuel FLUX non autorisée.');
        const image = await fetch(sample, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
        if (!image.ok || !image.body) throw new ServiceUnavailableException('Téléchargement FLUX indisponible.');
        const chunks: Uint8Array[] = []; let size = 0;
        for await (const chunk of image.body as unknown as AsyncIterable<Uint8Array>) {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) { await image.body.cancel().catch(() => undefined); throw new ServiceUnavailableException('Le visuel dépasse la limite autorisée.'); }
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        if (!isPng(bytes)) throw new ServiceUnavailableException('Format du visuel FLUX invalide.');
        return bytes;
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    throw new ServiceUnavailableException('FLUX prend plus de temps que prévu. Le suivi peut être repris.');
  }
}
