import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { isPng } from './preview-storage.js';

export type ImageInput = { prompt: string; referenceImage?: Buffer };
type UploadedImage = { name: string; subfolder: string; type: string };

const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

@Injectable()
export class ComfyUIImageProvider {
  private readonly baseUrl = process.env['COMFYUI_BASE_URL']?.replace(/\/$/, '');
  private readonly checkpoint = process.env['COMFYUI_CHECKPOINT']?.trim();

  async generate(input: ImageInput) { return this.run(input); }
  async edit(input: ImageInput & { referenceImage: Buffer }) { return this.run(input); }

  private async run(input: ImageInput) {
    if (!this.baseUrl || !this.checkpoint) throw new ServiceUnavailableException('ComfyUI n’est pas configuré.');
    let base: URL;
    try { base = new URL(this.baseUrl); } catch { throw new ServiceUnavailableException('L’URL ComfyUI est invalide.'); }
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.hash) throw new ServiceUnavailableException('La configuration ComfyUI est invalide.');
    const prompt = input.prompt.trim();
    if (prompt.length < 8 || prompt.length > 2000) throw new ServiceUnavailableException('Le brief pour ComfyUI est invalide.');

    let uploaded: UploadedImage | null = null;
    if (input.referenceImage) uploaded = await this.uploadReference(base, input.referenceImage);
    const workflow = this.workflow(prompt, uploaded);
    const response = await this.fetch(base, '/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: workflow }) });
    let submitted: unknown;
    try { submitted = await response.json(); } catch { throw new ServiceUnavailableException('ComfyUI n’a pas accepté le workflow.'); }
    if (!submitted || typeof submitted !== 'object' || typeof (submitted as { prompt_id?: unknown }).prompt_id !== 'string') throw new ServiceUnavailableException('ComfyUI a renvoyé une réponse de génération invalide.');
    const promptId = (submitted as { prompt_id: string }).prompt_id;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 110_000) {
      await wait(1000);
      const history = await this.fetch(base, `/history/${encodeURIComponent(promptId)}`);
      let state: unknown;
      try { state = await history.json(); } catch { continue; }
      if (!state || typeof state !== 'object' || !(promptId in state)) continue;
      const outputs = (state as Record<string, unknown>)[promptId];
      if (!outputs || typeof outputs !== 'object' || !('outputs' in outputs) || !(outputs as { outputs?: unknown }).outputs || typeof (outputs as { outputs: unknown }).outputs !== 'object') continue;
      const saveOutput = ((outputs as { outputs: Record<string, unknown> }).outputs['7'] ?? Object.values((outputs as { outputs: Record<string, unknown> }).outputs)[0]) as { images?: unknown } | undefined;
      const image = saveOutput?.images && Array.isArray(saveOutput.images) ? saveOutput.images[0] as { filename?: unknown; subfolder?: unknown; type?: unknown } : undefined;
      if (!image || typeof image.filename !== 'string' || typeof image.subfolder !== 'string' || typeof image.type !== 'string') throw new ServiceUnavailableException('ComfyUI n’a pas produit d’aperçu.');
      const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder, type: image.type });
      const imageResponse = await this.fetch(base, `/view?${query.toString()}`);
      const size = Number(imageResponse.headers.get('content-length'));
      if (Number.isFinite(size) && size > 2 * 1024 * 1024) throw new ServiceUnavailableException('L’aperçu ComfyUI dépasse 2 Mo.');
      const bytes = Buffer.from(await imageResponse.arrayBuffer());
      if (bytes.length > 2 * 1024 * 1024 || !isPng(bytes)) throw new ServiceUnavailableException('ComfyUI doit produire un PNG de 1 024 × 1 536 pixels maximum.');
      return bytes;
    }
    throw new ServiceUnavailableException('La génération ComfyUI a dépassé sa limite de temps.');
  }

  private async uploadReference(base: URL, bytes: Buffer): Promise<UploadedImage> {
    if (bytes.length > 2 * 1024 * 1024 || !isPng(bytes)) throw new ServiceUnavailableException('L’image de référence doit être un PNG de 2 Mo maximum.');
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'design-reference.png');
    form.append('type', 'input'); form.append('overwrite', 'true');
    const response = await this.fetch(base, '/upload/image', { method: 'POST', body: form });
    let image: unknown;
    try { image = await response.json(); } catch { throw new ServiceUnavailableException('ComfyUI a refusé l’image de référence.'); }
    if (!image || typeof image !== 'object' || typeof (image as UploadedImage).name !== 'string' || typeof (image as UploadedImage).subfolder !== 'string' || typeof (image as UploadedImage).type !== 'string') throw new ServiceUnavailableException('ComfyUI a renvoyé une référence invalide.');
    return image as UploadedImage;
  }

  private workflow(prompt: string, reference: UploadedImage | null): Record<string, unknown> {
    const nodes: Record<string, Record<string, unknown>> = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: this.checkpoint } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: `Create a premium event invitation background texture inspired by this creative direction: ${prompt}. Portrait composition, elegant visual hierarchy, strong readable negative space through the center, print-ready fine detail. Show no people, no words, no letters, no numbers, no QR codes, no logos, no watermark.`, clip: ['1', 1] } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'text, typography, letters, words, numbers, QR code, logo, watermark, blurry, low quality, cluttered, distorted, face, person', clip: ['1', 1] } },
      '5': { class_type: 'KSampler', inputs: { seed: randomInt(0, 2 ** 48), steps: 18, cfg: 5, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: reference ? 0.58 : 1, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: reference ? ['11', 0] : ['4', 0] } },
      '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
      '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'ai-design-preview', images: ['6', 0] } },
    };
    if (reference) {
      nodes['10'] = { class_type: 'LoadImage', inputs: { image: `${reference.subfolder ? `${reference.subfolder}/` : ''}${reference.name}` } };
      nodes['11'] = { class_type: 'VAEEncode', inputs: { pixels: ['10', 0], vae: ['1', 2] } };
    } else nodes['4'] = { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 768, batch_size: 1 } };
    return nodes;
  }

  private async fetch(base: URL, path: string, init?: RequestInit) {
    try {
      const response = await fetch(new URL(path, base), { ...init, cache: 'no-store', signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new ServiceUnavailableException(`ComfyUI a répondu avec le statut ${response.status}.`);
      return response;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Le moteur ComfyUI est indisponible.');
    }
  }
}
