import sharp from 'sharp';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;

export class ImageTranscodeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImageTranscodeError';
    this.code = code;
  }
}

export async function transcodeUserImage(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new ImageTranscodeError('INVALID_INPUT', 'Le fichier image est invalide.');
  }

  try {
    const original = await encodeVariant(bytes, 4096, 82);
    const preview = await encodeVariant(bytes, 1280, 78);
    const thumbnail = await encodeVariant(bytes, 320, 72);

    return Object.freeze({
      bytes: original.bytes,
      mimeType: 'image/webp',
      width: original.width,
      height: original.height,
      preview: preview.bytes,
      thumbnail: thumbnail.bytes,
    });
  } catch (error) {
    if (error instanceof ImageTranscodeError) throw error;
    throw new ImageTranscodeError('IMAGE_DECODE_FAILED', 'Le contenu de l’image est illisible.');
  }
}

async function encodeVariant(bytes, maxDimension, quality) {
  const { data, info } = await sharp(bytes, {
    failOn: 'error',
    limitInputPixels: MAX_IMAGE_PIXELS,
    animated: false,
    pages: 1,
    sequentialRead: true,
  })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });

  if (
    info.format !== 'webp' ||
    !Number.isInteger(info.width) ||
    !Number.isInteger(info.height) ||
    info.width < 1 ||
    info.height < 1 ||
    info.width * info.height > MAX_IMAGE_PIXELS
  ) {
    throw new ImageTranscodeError('INVALID_OUTPUT', 'Le traitement de l’image a échoué.');
  }
  if (data.length === 0 || data.length > MAX_IMAGE_BYTES) {
    throw new ImageTranscodeError('OUTPUT_TOO_LARGE', 'L’image réencodée dépasse 5 Mio.');
  }
  return { bytes: data, width: info.width, height: info.height };
}
